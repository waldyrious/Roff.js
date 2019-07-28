"use strict";

const {GroffAdapter, which} = require("..");
const fs = require("fs");
const {delimiter, join} = require("path");

describe("GroffAdapter", function(){
	this.timeout(15000);
	let groff = null;
	let oldpwd = null;
	let oldpath = {};
	
	before("Setting up environment", async () => {
		oldpwd = process.cwd();
		oldpath = process.env.PATH;
		process.env.PATH += delimiter + join("win32" === process.platform
			? __dirname.replace(/";"|;/g, '";"')
			: __dirname.replace(/:/g, "\\:"), "fixtures", "troff", "shims");
		expect(await which("chem")).not.to.be.empty;
		expect(await which("grap")).not.to.be.empty;
		expect(await which("grn")).not.to.be.empty;
		process.chdir(__dirname);
	});
	
	after("Restoring environment", () => {
		process.env.PATH = oldpath;
		process.chdir(oldpwd);
	});
	
	before("Locating groff binary", async () => {
		groff = await GroffAdapter.loadDefault();
		expect(groff).to.be.an.instanceOf(GroffAdapter);
		expect(fs.existsSync(groff.path)).to.be.true;
		if("win32" !== process.platform)
			expect(Boolean(0o111 & fs.statSync(groff.path).mode)).to.be.true;
	});
	
	describe("Initialisation", () => {
		it("throws an error if constructed without a path", () => {
			const error = "[GroffAdapter::constructor] Cannot initialise without executable path";
			expect(() => new GroffAdapter())    .to.throw(TypeError, error);
			expect(() => new GroffAdapter(""))  .to.throw(TypeError, error);
			expect(() => new GroffAdapter(null)).to.throw(TypeError, error);
		});
	});
	
	describe("traceDefs()", () => {
		it("retrieves line numbers of defined objects", async () => {
			const path = join(__dirname, "fixtures", "troff", "defs.1");
			const defs = await (await GroffAdapter.loadDefault()).traceDefs(path);
			expect(defs.get(path)).to.eql({
				chars:      new Map([["foo", 1]]),
				colours:    new Map([["red", 2]]),
				diversions: new Map([["qux", 3]]),
				macros:     new Map([["foo", 5]]),
				registers:  new Map([["foo", 8]]),
				strings:    new Map([["bar", 7]]),
			});
		});
		
		it("omits definitions which are deleted in the same file", async () => {
			const path = join(__dirname, "fixtures", "troff", "defs.2");
			const defs = await (await GroffAdapter.loadDefault()).traceDefs(path);
			expect(defs.get(path)).to.eql({
				chars:      new Map(),
				colours:    new Map(),
				diversions: new Map(),
				macros:     new Map(),
				registers:  new Map([["foo", 8], ["baz", 11]]),
				strings:    new Map([["foo", 2], ["baz", 5]]),
			});
		});
	});
	
	describe("format()", () => {
		const notice = (msg, indent = 10) => {
			const {isTTY} = process.stdout;
			console.log(" ".repeat(indent) + (isTTY ? "\x1B[36m" : "") + msg + (isTTY ? "\x1B[0m" : ""));
		};
		
		describe("Devices", () => {
			it("formats TeX DVI",     async () => expect(await groff.format("Foo", "dvi")).to.match(/^\xF7\x02/));
			it("formats Canon LBP-4", async () => expect(await groff.format("Foo", "lbp")).to.match(/^\x1Bc\x1B/));
			it("formats HP PCL",      async () => expect(await groff.format("Foo", "lj4")).to.match(/^\x1BE\x1B/));
			it("formats PostScript",  async () => expect(await groff.format("Foo", "ps")).to.match(/^%!PS/));
			it("formats PDF",         async () => groff.devices.pdf
				? expect(await groff.format("Foo", "pdf")).to.match(/^%PDF-/).and.to.match(/%%EOF\s*$/)
				: notice("- skipping: gropdf not supported by host"));
			
			it("formats plain ASCII text", async () => {
				expect((await groff.format("\\(lqFoo\\(rq", "ascii")).trim()).to.equal('"Foo"');
				expect((await groff.format("\\(oqBar\\(cq", "ascii")).trim()).to.match(/^[`']Bar'$/);
				expect((await groff.format("\\(coBaz\\(rg", "ascii")).trim()).to.equal("(C)Baz(R)");
			});
			
			it("formats plain Latin-1 text", async () => {
				expect((await groff.format("\\(lqFoo\\(rq", "latin1")).trim()).to.equal('"Foo"');
				expect((await groff.format("\\(oqBar\\(cq", "latin1")).trim()).to.match(/^[`']Bar'$/);
				expect((await groff.format("\\(coBaz\\(rg", "latin1")).trim()).to.equal("©Baz®");
			});
			
			it("formats plain UTF8 text", async () => {
				expect((await groff.format("\\(lqFoo\\(rq", "utf8")).trim()).to.equal("“Foo”");
				expect((await groff.format("\\(oqBar\\(cq", "utf8")).trim()).to.equal("‘Bar’");
				expect((await groff.format("\\(coBaz\\(rg", "utf8")).trim()).to.equal("©Baz®");
			});
			
			it("throws an error for an unrecognised device", async () => {
				// HACK: Chai's `.throw` doesn't seem to grok async functions
				let error;
				try{ await groff.format("Foo", "foo"); }
				catch(e){ error = e; }
				expect(error).to.be.an.instanceOf(ReferenceError);
				expect(error.toString()).to.match(/Unrecognised device: foo/);
			});
		});
		
		describe("Options", () => {
			it("supports arbitrary arguments", async () => {
				const output = await groff.format("\\*[FOO]", "utf8", {args: ["-dFOO=BAR"]});
				expect(output.trim()).to.equal("BAR");
			});
			
			it("supports ASCII approximation", async () => {
				const output = await groff.format("Foo Bar", "ps", {asciiApprox: true});
				expect(output.trim()).to.include("Foo Bar").and.to.match(/^<beginning of page>\n/);
			});
			
			it("supports compatibility mode", async () => {
				const output = await groff.format(".ds FOO BAR\n\\*[FOO]", "utf8", {compatMode: true});
				expect(output.trim()).to.equal("FOO]");
			});
			
			it("supports default fonts", async () => {
				expect(await groff.format("Foo", "ps",   {defaultFont: "C"})).to.match(/^%%DocumentNeededResources: font Courier$/m);
				expect(await groff.format("Foo", "ps",   {defaultFont: "H"})).to.match(/^%%DocumentNeededResources: font Helvetica$/m);
				expect(await groff.format("Foo", "utf8", {defaultFont: "C"})).to.include("Foo");
			});
			
			it("supports default stroke-widths", async () => {
				expect(await groff.format(".PS\nbox\n.PE", "ps",   {args: ["-p"], defaultStroke:  5555})).to.match(/\s+55\.55\s+LW\b/);
				expect(await groff.format(".PS\nbox\n.PE", "ps",   {args: ["-p"], defaultStroke: 55560})).to.match(/\s+555\.6\s+LW\b/);
				expect(await groff.format(".PS\nbox\n.PE", "utf8", {args: ["-p"], defaultStroke:  4320})).to.be.ok;
			});
			
			it("supports custom device descriptions", async () => {
				const fontDescPath = join(__dirname, "fixtures", "troff");
				expect(await groff.format("Foo", "utf8", {args: ["-Z"]})).to.match(/^x res 240 24 40$/m); // Sanity check
				expect(await groff.format("Foo", "utf8", {args: ["-Z"], fontDescPath})).to.match(/^x res 640 32 48$/m);
			});
			
			it("supports direct file reads", async () => {
				const inputFile = join(__dirname, "fixtures", "troff", "format.me");
				expect(await groff.format("",   "utf8", {inputFile})).to.match(/^Hello, world\s*$/);
				expect(await groff.format(null, "utf8", {inputFile})).to.match(/^Hello, world\s*$/);
				expect(await groff.format(null, "utf8", {inputFile, pageWidth: "5n"})).to.match(/^Hello,\nworld\s*$/);
				const inputData = ".ds str Goodbye, world\n";
				expect(await groff.format(inputData, "utf8", {inputFile})).to.match(/^Goodbye, world\s*$/);
				expect(await groff.format(inputData, "utf8", {inputFile, pageWidth: "5n"})).to.match(/^Goodbye,\nworld\s*$/);
			});
			
			it("supports landscape orientation", async () => {
				expect(await groff.format("Foo", "ps",   {landscape: false})).to.match(/^%%Orientation: Portrait$/m);
				expect(await groff.format("Foo", "ps",   {landscape: true})).to.match(/^%%Orientation: Landscape$/m);
				expect(await groff.format("Foo", "utf8", {landscape: true})).to.include("Foo");
			});
			
			it("supports macro search paths", async () => {
				const macroFilePath = join(__dirname, "fixtures", "troff");
				expect(await groff.format(".FOO", "ps",   {args: ["-mfoo", "-a"], macroFilePath})).to.match(/^Foo$/m);
				expect(await groff.format(".BAR", "utf8", {args: ["-mfoo"], macroFilePath})).to.match(/^Bar$/m);
			});
			
			it("supports macro file inclusion", async () => {
				expect(await groff.format(".Fx", "ps",   {args: ["-a"], macros: ["doc"]})).to.match(/^FreeBSD$/m);
				expect(await groff.format(".Fx", "ps",   {args: ["-a"], macros: "doc"})).to.match(/^FreeBSD$/m);
				expect(await groff.format(".Fx \\*[paper-a4-width]", "ps", {
					args:   ["-dpaper=a4", "-a"],
					macros: ["doc", "papersize"],
				})).to.match(/^FreeBSD 21c$/m);
				expect(await groff.format(".Ox", "utf8", {macros: ["doc"]})).to.match(/^OpenBSD$/m);
				expect(await groff.format(".Ox", "utf8", {macros: "doc"})).to.match(/^OpenBSD$/m);
				expect(await groff.format(".Ox \\*[paper-a4-length]", "utf8", {
					args: ["-dpaper=a4"],
					macros: "doc papersize",
				})).to.match(/^OpenBSD 29.7c$/m);
			});
			
			it("supports disabling of coloured output", async () => {
				const input = "\\X'tty: sgr 1'\n.defcolor red rgb #FF0000\n\\m[red]Foo";
				expect(await groff.format(input, "ps")).to.match(/\s+1 0 0 Cr\//);
				expect(await groff.format(input, "ps", {noColours: true})).not.to.match(/\s+1 0 0 Cr\//);
				expect(await groff.format(input, "utf8")).to.match(/^\s*\x1B\[31mFoo\x1B\[0m\s*$/);
				expect(await groff.format(input, "utf8", {noColours: true})).to.match(/^\s*Foo\s*$/);
			});
			
			it("supports disabling of error messages", async () => {
				const warning = /warning: can't find special character [`']XX'$/m;
				const fn = async (device, opts = {}) => {
					let result;
					try{ result = await groff.format("\\(XX\n.ab", device, opts); }
					catch(error){ result = error.toString(); }
					return result;
				};
				expect(await fn("ps")).to.match(warning);
				expect(await fn("utf8")).to.match(warning);
				expect(await fn("ps", {noErrors: true})).not.to.match(warning);
				expect(await fn("utf8", {noErrors: true})).not.to.match(warning);
			});
			
			it("supports printing multiple copies", async () => {
				expect(await groff.format("Foo", "ps",   {numCopies: 4})).to.match(/^%%Requirements: numcopies\(4\)$/m);
				expect(await groff.format("Foo", "ps",   {numCopies: 8})).to.match(/^%%Requirements: numcopies\(8\)$/m);
				expect(await groff.format("Foo", "utf8", {numCopies: 2})).to.include("Foo");
			});
			
			it("supports direct file writes", async () => {
				const outputFile = join(__dirname, "fixtures", "troff", "out.ps");
				fs.existsSync(outputFile) && fs.unlinkSync(outputFile);
				expect(await groff.format("Foo", "ps", {outputFile})).to.equal("");
				expect(fs.existsSync(outputFile)).to.be.true;
				expect(fs.readFileSync(outputFile)).to.match(/^%!PS/).and.to.match(/%%EOF\s*$/);
				
				fs.unlinkSync(outputFile);
				expect(await groff.format("Foo", "utf8", {outputFile})).to.equal("");
				expect(fs.existsSync(outputFile)).to.be.true;
				expect(fs.readFileSync(outputFile).toString()).to.match(/^Foo\s*$/);
				fs.unlinkSync(outputFile);
			});
			
			it("supports initial page length", async () => {
				expect(await groff.format("\\n(.p", "ps", {args: ["-a"], pageLength: "3.5i"})).to.match(/^252000$/m);
				expect(await groff.format("\\n(.p", "ps", {args: ["-a"], pageLength: "340n"})).to.match(/^1700000$/m);
				expect(await groff.format("\\n(.p", "ps", {args: ["-a"], pageLength: 340}))   .to.match(/^1700000$/m);
				expect(await groff.format("Foo", "ascii", {pageLength: "2v"})).to.equal("Foo\n\n");
				expect(await groff.format("Foo", "utf8",  {pageLength: "3v"})).to.equal("Foo\n\n\n");
				expect(await groff.format("Foo", "utf8",  {pageLength: "3n"})).to.equal("Foo\n\n");
				expect(await groff.format("Foo", "utf8",  {pageLength: 3}))   .to.equal("Foo\n\n");
			});
			
			it("supports initial page width", async () => {
				expect(await groff.format("\\n(.l", "ps",   {args: ["-a"], pageWidth: "10i"})).to.match(/^720000$/m);
				expect(await groff.format("\\n(.l", "ps",   {args: ["-a"], pageWidth: ".5i"})).to.match(/^36000$/m);
				expect(await groff.format("\\n(.l", "ps",   {args: ["-a"], pageWidth: "35n"})).to.match(/^175000$/m);
				expect(await groff.format("\\n(.l", "ps",   {args: ["-a"], pageWidth: 35}))   .to.match(/^175000$/m);
				expect(await groff.format("\\n(.l", "utf8", {pageWidth: "10i"}))              .to.match(/^2400\s*$/);
				expect(await groff.format("\\n(.l", "utf8", {pageWidth: "36.6p"}))            .to.match(/^120\s*$/);
				expect(await groff.format("\\n(.l", "utf8", {pageWidth: "240n"}))             .to.match(/^5760\s*$/);
				expect(await groff.format("\\n(.l", "utf8", {pageWidth: 240}))                .to.match(/^5760\s*$/);
			});
			
			it("supports initial page index", async () => {
				expect(await groff.format(".bp\nPage \\n%", "ps",    {args: ["-a"], pageStartIndex: 5})).to.match(/^Page 6$/m);
				expect(await groff.format(".bp\nPage \\n%", "utf8",  {pageStartIndex: 2})).to.match(/^\s*Page 3\s*$/);
				expect(await groff.format(".bp\nPage \\n%", "ascii", {pageStartIndex: 3})).to.match(/^\s*Page 4\s*$/);
			});
			
			it("supports page ranges", async () => {
				const input = ["Foo", "Bar", "Baz", "Qux"].join("\n.bp\n");
				const clean = input => input.replace(/<beginning of page>\n/g, "").trim();
				expect(clean(await groff.format(input, "ps",   {args: ["-a"], pageRanges: ["2"]})))  .to.match(/^Bar$/);
				expect(clean(await groff.format(input, "ps",   {args: ["-a"], pageRanges: ["3,4"]}))).to.match(/^Baz\nQux$/);
				expect(clean(await groff.format(input, "ps",   {args: ["-a"], pageRanges: ["2-4"]}))).to.match(/^Bar\nBaz\nQux$/);
				expect(clean(await groff.format(input, "ps",   {args: ["-a"], pageRanges: [2, 4]}))) .to.match(/^Bar\nQux$/);
				expect(clean(await groff.format(input, "utf8", {pageRanges: [1, "2-3"]})))           .to.match(/^Foo\s+Bar\s+Baz$/);
				expect(clean(await groff.format(input, "utf8", {pageRanges: ["2,4"]})))              .to.match(/^Bar\s+Qux$/);
				expect(clean(await groff.format(input, "utf8", {pageRanges: ["3"]})))                .to.match(/^Baz$/);
			});
			
			it("supports paper sizes", async () => {
				expect(await groff.format("Foo", "ps",    {paperSize: "a3"})).to.include("/PageSize [ 842 1191 ]");
				expect(await groff.format("Foo", "ps",    {paperSize: "a4"})).to.include("/PageSize [ 595 842 ]");
				expect(await groff.format("Foo", "ascii", {paperSize: "a3"})).to.include("Foo");
				expect(await groff.format("Foo", "utf8",  {paperSize: "a4"})).to.include("Foo");
			});
			
			it("supports intermediate output", async () => {
				expect(await groff.format("Foo", "dvi",    {raw: true})).to.match(/^x\s+T\s+dvi\n/);
				expect(await groff.format("Foo", "lbp",    {raw: true})).to.match(/^x\s+T\s+lbp\n/);
				expect(await groff.format("Foo", "lj4",    {raw: true})).to.match(/^x\s+T\s+lj4\n/);
				expect(await groff.format("Foo", "ps",     {raw: true})).to.match(/^x\s+T\s+ps\n/);
				expect(await groff.format("Foo", "ascii",  {raw: true})).to.match(/^x\s+T\s+ascii\n/);
				expect(await groff.format("Foo", "latin1", {raw: true})).to.match(/^x\s+T\s+latin1\n/);
				expect(await groff.format("Foo", "utf8",   {raw: true})).to.match(/^x\s+T\s+utf8\n/);
			});
			
			it("supports predefined registers", async () => {
				const input = "\\n[FOO] \\n[BAR] \\nb \\nq";
				const registers = {FOO: 1, BAR: 2, b: -9, q: 885};
				expect(await groff.format(input, "ps",    {args: ["-a"], registers})).to.match(/^1 2 -9 885$/m);
				expect(await groff.format(input, "ascii", {registers})).to.match(/^1 2 -9 885\s*$/);
			});
			
			it("supports predefined strings", async () => {
				const input = "\\*[FOO] \\*[BAR] \\*b \\*q";
				const strings = {FOO: "foo", BAR: "bar", b: "BAZ", q: "QUX"};
				expect(await groff.format(input, "ps",   {args: ["-a"], strings})).to.match(/^foo bar BAZ QUX$/m);
				expect(await groff.format(input, "utf8", {strings})).to.match(/^foo bar BAZ QUX\s*$/);
			});
			
			it("supports unsafe mode", async () => {
				const input = ".pso echo foo bar";
				expect(await groff.format(input, "utf8", {unsafe: true})).to.match(/^foo bar\s*$/);
			});
		});
		
		describe("Preprocessors", () => {
			const trim = input => input.replace(/^\n+|\n+$|.\x08/g, "");
			const lock = (input, refs = null) => {
				refs = refs || new WeakSet();
				if(!Object.isFrozen(input) && !refs.has(input)){
					refs.add(input);
					for(const [key, value] of Object.entries(input))
						input[key] = lock(value, refs);
					Object.freeze(input);
				}
				return input;
			};
			
			describe("when processing arbitrary input", () => {
				it("formats chemical diagrams", async () => {
					const input = ".cstart\nsize 20\nCH1\nbond\nCH2\n.cend\n";
					expect(await groff.format(input, "ascii", {chemicals: false})).to.match(/^size 20 CH1 bond CH2\s*$/m);
					expect(await groff.format(input, "utf8",  {chemicals: false})).to.match(/^size 20 CH1 bond CH2\s*$/m);
					expect(await groff.format(input, "ascii", {chemicals: true})).to.match(/^\s*CH1\s*--+\s*CH2\s*$/m);
					expect(await groff.format(input, "utf8",  {chemicals: true})).to.match(/^\s*CH1\s*──+\s*CH2\s*$/m);
				});
				
				it("formats equations", async () => {
					const input = ".EQ\ndefine foo 'i = inf'\nfoo\n.EN\n";
					expect(await groff.format(input, "ascii", {equations: false})).to.match(/^define foo 'i = inf' foo\s*$/);
					expect(await groff.format(input, "utf8",  {equations: false})).to.match(/^define foo ’i = inf’ foo\s*$/);
					expect(await groff.format(input, "ascii", {equations: true})).to.match(/^\x1B\[4mi\x1B\[24m=/);
					expect(await groff.format(input, "utf8",  {equations: true})).to.match(/^\x1B\[4mi\x1B\[24m=∞\s*$/);
				});
				
				it("embeds linked files", async () => {
					const input = `.rm so\n<\n.so ${join(__dirname, "fixtures/troff/format.me")}\n>`;
					expect(await groff.format(input, "ascii", {expandLinks: false})).to.match(/^< >\s*$/);
					expect(await groff.format(input, "ascii", {expandLinks: true})).to.match(/^< Hello, world >\s*$/);
				});

				it("normalises character sets", async () => {
					const input = "→  “Foo — Bar”  ←\n";
					expect(await groff.format(input, "ascii", {fixEncoding: false})).to.match(/^ +Foo +Bar\s*$/);
					expect(await groff.format(input, "utf8",  {fixEncoding: false})).to.match(/^â +âFoo â Barâ +â\s*$/);
					expect(await groff.format(input, "ascii", {fixEncoding: true})).to.match(/^-> +"Foo -- Bar" +<-\s*$/);
					expect(await groff.format(input, "utf8",  {fixEncoding: true})).to.match(/^→  +“Foo — Bar” + ←\s*$/);
				});
				
				it("formats graphs", async () => {
					const path  = join(__dirname, "fixtures", "troff", "graph");
					const ascii = trim(fs.readFileSync(path + "-ascii.txt", {encoding: "latin1"}));
					const utf8  = trim(fs.readFileSync(path + "-utf8.txt",  {encoding: "utf8"}));
					const input = fs.readFileSync(path + ".roff",  {encoding: "utf8"});
					expect(trim(await groff.format(input, "ascii", {graphs: false}))).to.match(/^ticks left out at [\d\s.,]+$/);
					expect(trim(await groff.format(input, "ascii", {graphs: true}))).to.equal(ascii);
					expect(trim(await groff.format(input, "utf8",  {graphs: true}))).to.equal(utf8);
				});
				
				it("formats gremlin images", async () => {
					const path  = join(__dirname, "fixtures", "troff", "gremlin");
					const ascii = trim(fs.readFileSync(path + "-ascii.txt", {encoding: "latin1"}));
					const utf8  = trim(fs.readFileSync(path + "-utf8.txt",  {encoding: "utf8"}));
					const input = fs.readFileSync(path + ".roff",  {encoding: "utf8"});
					expect(trim(await groff.format(input, "ascii", {gremlins: false}))).to.match(/^width +6\.0 +height +7\.0/);
					expect(trim(await groff.format(input, "ascii", {gremlins: true}))).to.equal(ascii);
					expect(trim(await groff.format(input, "utf8",  {gremlins: true}))).to.equal(utf8);
				});
				
				// TODO: Actually find a working ideal(1) implementation
				it.skip("formats ideal images", async () => {
					
				});
				
				it("formats newline-free eqn(1) delimiters", async () => {
					const input  = ".EQ\ndelim {}\n.EN\nFoo {x1 + x2 = y\n} bar {baz}.\n";
					const output = "Foo \x1B[4mx\x1B[24m1+\x1B[4mx\x1B[24m2=\x1B[4my\x1B[24m bar \x1B[4mbaz\x1B[24m.";
					const broken = "Foo {x1 + x2 = y } bar \x1B[4mbaz\x1B[24m.";
					expect(trim(await groff.format(input, "utf8", {equations: true, noNewlines: false}))).to.equal(output);
					expect(trim(await groff.format(input, "utf8", {equations: true, noNewlines: true}))).to.equal(broken);
				});
				
				it("formats line drawings", async () => {
					const input = '.PS\n"Foo"; line 4; "Bar";\n.PE\n';
					expect(await groff.format(input, "ascii", {pictures: true})).to.match(/^\s*\x08F(-\x08o){2}--+\x08B-\x08a-\x08r\s*$/m);
					expect(await groff.format(input, "utf8",  {pictures: true})).to.match(/^\s*\x08F(─\x08o){2}──+\x08B─\x08a─\x08r\s*$/m);
				});

				it("supports arbitrary preprocessors", async () => { // Total overkill, but W/E
					expect(await groff.format("foo\n", "utf8", {preprocessors: [["tr", "a-z", "A-Z"]]})).to.match(/^\s*FOO\s*$/);
					expect(await groff.format("foo\n", "utf8", {preprocessors: [["rev"], ["nl", "-v3"]]})).to.match(/^\s+3[ \t]+oof\s*$/);
					const args = ["-I", join(__dirname, "fixtures", "troff")];
					const opt = lock({args, expandLinks: true, macros: ["an"], preprocessors: [["tr", "'a-zA-Z", "/n-za-mN-ZA-M"], ["sed", "/./ s/^/./g"]]});
					const out = /^\s*TITLE\(1\)[^\n]+?TITLE\(1\)\n\s+\x1B\[1mSECTION\s*\x1B\[0m\n\s+\x1B\[4mParagraph\x1B\[24m\s+Hello, world\s+/;
					expect(await groff.format("GU GVGYR 1\nFU FRPGVBA\nV Cnentencu\nfb svkgherf'gebss'sbezng.zr\n", "utf8", opt)).to.match(out);
					expect(await groff.format("GU GVGYR 1\nFU FRPGVBA\nV Cnentencu\nfb sbezng.zr\n", "utf8", opt)).to.match(out);
				});
				
				it("formats bibliographic references", async () => {
					const input = ".R1\nno-default-database\n.R2\nFoo\n.[[\n%A 1\n%T 2\n.]]\nBar\n.[[\n%A 3\n%T 4\n.]]\n";
					expect(trim(await groff.format(input, "utf8", {refer: false}))).to.equal("no‐default‐database Foo %A 1 %T 2 Bar %A 3 %T 4");
					expect(trim(await groff.format(input, "utf8", {refer: true}))).to.equal("Foo[1] Bar[2]");
				});

				it("formats tables", async () => {
					const input = ".TS\ntab(|);\nlb l li .\n_\nFoo|Bar|Baz\n.TE\n";
					expect(await groff.format(input, "ascii", {tables: false})).to.match(/^tab\(\|\); lb l li \. +_ Foo\|Bar\|Baz\s*$/);
					expect(await groff.format(input, "ascii", {tables: true})).to.match(/^-+\n\x1B\[1mFoo +\x1B\[22mBar +\x1B\[4mBaz/);
					expect(await groff.format(input, "utf8",  {tables: true})).to.match(/^─+\n\x1B\[1mFoo +\x1B\[22mBar +\x1B\[4mBaz/);
				});
			});
			
			describe("when processing files", () => {
				it("formats chemical diagrams", async () => {
					const path  = join(__dirname, "fixtures", "troff", "chem");
					const ascii = trim(fs.readFileSync(path + "-ascii.txt", {encoding: "latin1"}));
					const utf8  = trim(fs.readFileSync(path + "-utf8.txt",  {encoding: "utf8"}));
					const file  = fs.readFileSync(path + ".roff", {encoding: "utf8"});
					expect(trim(await groff.format(null, "ascii", {chemicals: false, inputFile: path + ".roff"}))).to.match(/ bond left After$/);
					expect(trim(await groff.format(null, "ascii", {chemicals: true,  inputFile: path + ".roff"}))).to.equal(ascii);
					expect(trim(await groff.format(null, "utf8",  {chemicals: true,  inputFile: path + ".roff"}))).to.equal(utf8);
					expect(trim(await groff.format(file, "utf8",  {chemicals: true,  inputFile: path + ".roff"}))).to.equal(utf8 + " " + utf8);
				});
				
				it("formats equations", async () => {
					const path = join(__dirname, "fixtures", "troff", "eqn");
					const off  = trim(fs.readFileSync(path + "-off.txt", "utf8"));
					const on   = trim(fs.readFileSync(path + "-on.txt",  "utf8"));
					const file = fs.readFileSync(path + ".roff", {encoding: "utf8"});
					expect(trim(await groff.format(null, "utf8", {inputFile: path + ".roff", equations: false}))).to.equal(off);
					expect(trim(await groff.format(null, "utf8", {inputFile: path + ".roff", equations: true}))).to.equal(on);
					expect(trim(await groff.format(file, "utf8", {inputFile: path + ".roff", equations: true}))).to.equal(on + "\n" + on);
				});
				
				it("embeds linked files", async () => {
					const path = join(__dirname, "fixtures", "troff", "link");
					const file = fs.readFileSync(path + ".1", {encoding: "utf8"});
					expect(await groff.format(null, "utf8", {expandLinks: true, inputFile: path + ".1"})).to.match(/^< Hello, world >\s*$/);
					expect(await groff.format(null, "utf8", {expandLinks: true, inputFile: path + ".2"})).to.match(/^(< Hello, world >\s*){1}$/);
					expect(await groff.format(file, "utf8", {expandLinks: true, inputFile: path + ".2"})).to.match(/^(< Hello, world >\s*){2}$/);
				});

				it("normalises character sets", async () => {
					const path = join(__dirname, "fixtures", "troff", "utf8.roff");
					const file = fs.readFileSync(path, {encoding: "utf8"});
					expect(await groff.format(null, "utf8", {inputFile: path, fixEncoding: false})).to.match(/^â +âFoo â Barâ +â\s*$/);
					expect(await groff.format(null, "utf8", {inputFile: path, fixEncoding: true})).to.match(/^(→  +“Foo — Bar” + ←\s*){1}$/);
					expect(await groff.format(file, "utf8", {inputFile: path, fixEncoding: true})).to.match(/^(→  +“Foo — Bar” + ←\s*){2}$/);
				});
				
				it("formats graphs", async () => {
					const path  = join(__dirname, "fixtures", "troff", "graph");
					const opts  = {graphs: true, inputFile: path + ".roff"};
					const ascii = trim(fs.readFileSync(path + "-ascii.txt", {encoding: "latin1"}));
					const utf8  = trim(fs.readFileSync(path + "-utf8.txt",  {encoding: "utf8"}));
					const file  = fs.readFileSync(path + ".roff", {encoding: "utf8"});
					expect(trim(await groff.format(null, "ascii", opts))).to.equal(ascii);
					expect(trim(await groff.format(null, "utf8",  opts))).to.equal(utf8);
					expect(trim(await groff.format(file, "utf8",  opts)).replace(/\n{2,}/g, "\n")).to.equal(utf8 + "\n" + utf8);
				});
				
				it("formats gremlin images", async () => {
					const path  = join(__dirname, "fixtures", "troff", "gremlin");
					const ascii = trim(fs.readFileSync(path + "-ascii.txt", {encoding: "latin1"}));
					const utf8  = trim(fs.readFileSync(path + "-utf8.txt",  {encoding: "utf8"}));
					const file  = fs.readFileSync(path + ".roff", {encoding: "utf8"});
					expect(trim(await groff.format(null, "ascii", {gremlins: true, inputFile: path + ".roff"}))).to.equal(ascii);
					expect(trim(await groff.format(null, "utf8",  {gremlins: true, inputFile: path + ".roff"}))).to.equal(utf8);
					expect(trim(await groff.format(file, "utf8",  {gremlins: true, inputFile: path + ".roff"}))).to.equal(utf8 + "\n" + utf8);
				});
				
				// TODO: Actually find a working ideal(1) implementation
				it.skip("formats ideal images", async () => {
					const path  = join(__dirname, "fixtures", "troff", "ideal");
					const ascii = trim(fs.readFileSync(path + "-ascii.txt", {encoding: "latin1"}));
					const utf8  = trim(fs.readFileSYnc(path + "-utf8.txt",  {encoding: "utf8"}));
					expect(trim(await groff.format(null, "ascii", {ideal: true, inputFile: path + ".roff"}))).to.equal(ascii);
					expect(trim(await groff.format(null, "utf8",  {ideal: true, inputFile: path + ".roff"}))).to.equal(utf8);
				});
				
				it("formats newline-free eqn(1) delimiters", async () => {
					const path = join(__dirname, "fixtures", "troff", "eqn");
					const opts = {equations: true, inputFile: path + ".roff"};
					const good = trim(fs.readFileSync(path + "-on.txt",  {encoding: "utf8"}));
					const bad  = trim(fs.readFileSync(path + "-bad.txt", {encoding: "utf8"}));
					const file = fs.readFileSync(path + ".roff", {encoding: "utf8"});
					expect(trim(await groff.format(null, "utf8", {...opts, noNewlines: false}))).to.equal(good);
					expect(trim(await groff.format(null, "utf8", {...opts, noNewlines: true}))).to.equal(bad);
					expect(trim(await groff.format(file, "utf8", {...opts, noNewlines: true}))).to.equal(bad + "\n" + bad);
				});
				
				it("formats line drawings", async () => {
					const path  = join(__dirname, "fixtures", "troff", "pic");
					const ascii = trim(fs.readFileSync(path + "-ascii.txt", {encoding: "latin1"}));
					const utf8  = trim(fs.readFileSync(path + "-utf8.txt",  {encoding: "utf8"}));
					const file  = fs.readFileSync(path + ".roff", {encoding: "utf8"});
					expect(trim(await groff.format(null, "ascii", {inputFile: path + ".roff", pictures: false}))).to.match(/move to last box/);
					expect(trim(await groff.format(null, "ascii", {inputFile: path + ".roff", pictures: true}))).to.equal(ascii);
					expect(trim(await groff.format(null, "utf8",  {inputFile: path + ".roff", pictures: true}))).to.equal(utf8);
					expect(trim(await groff.format(file, "utf8",  {inputFile: path + ".roff", pictures: true}))).to.equal(utf8 + " " + utf8);
				});

				it("supports arbitrary preprocessors", async () => {
					const path = join(__dirname, "fixtures", "troff", "markdown.md");
					const file = fs.readFileSync(path, {encoding: "utf8"}) + ".br\n";
					const opts = {inputFile: path, preprocessors: [
						["sed", "s/_\\([^_]*\\)_/|fI\\1|fP/g"],
						["sed", "s/\\*\\*\\([^\\*]*\\)\\*\\*/|fB\\1|fP/g"],
						["sed", "s/|/\\\\/g; s/weak/better/g"],
					]};
					const out = "This \x1B[4mis\x1B[24m a \x1B[1mbetter \x1B[22mmarkup language.";
					expect(trim(await groff.format(null, "utf8", opts))).to.equal(out);
					expect(trim(await groff.format(file, "utf8", opts))).to.equal(out + "\n" + out);
					opts.expandLinks = true;
					opts.preprocessors.push(["sed", 's/\\\\" //g']);
					expect(trim(await groff.format(null, "utf8", opts))).to.equal(`< Hello, world > ${out}`);
					expect(trim(await groff.format(file, "utf8", opts))).to.equal(`< Hello, world > ${out}\n`.repeat(2).trim());
				});
				
				it("formats bibliographic references", async () => {
					const path = join(__dirname, "fixtures", "troff", "refer");
					const off  = trim(fs.readFileSync(path + "-off.txt", "utf8"));
					const on   = trim(fs.readFileSync(path + "-on.txt",  "utf8"));
					const file = fs.readFileSync(path + ".roff", {encoding: "utf8"});
					expect(trim(await groff.format(null, "utf8", {inputFile: path + ".roff", refer: false}))).to.equal(off);
					expect(trim(await groff.format(null, "utf8", {inputFile: path + ".roff", refer: true}))).to.equal(on);
					expect(trim(await groff.format(file, "utf8", {inputFile: path + ".roff", refer: true}))).to.equal(on + "\n" + on);
				});

				it("formats tables", async () => {
					const path  = join(__dirname, "fixtures", "troff", "tbl");
					const ascii = trim(fs.readFileSync(path + "-ascii.txt", {encoding: "latin1"}));
					const utf8  = trim(fs.readFileSync(path + "-utf8.txt",  {encoding: "utf8"}));
					const file  = fs.readFileSync(path + ".roff", {encoding: "utf8"});
					expect(trim(await groff.format(null, "ascii", {inputFile: path + ".roff", tables: false}))).to.match(/\stab\(;\) allbox;\s/);
					expect(trim(await groff.format(null, "ascii", {inputFile: path + ".roff", tables: true}))).to.equal(ascii);
					expect(trim(await groff.format(null, "utf8",  {inputFile: path + ".roff", tables: true}))).to.equal(utf8);
					expect(trim(await groff.format(file, "utf8",  {inputFile: path + ".roff", tables: true}))).to.equal(utf8 + " " + utf8);
				});
			});
		});
	});
});