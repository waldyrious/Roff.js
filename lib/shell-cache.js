"use strict";

const {open, readFile} = require("fs");
const {exec, spawn}    = require("child_process");


/**
 * Convenience interface that performs asynchronous disk or shell
 * operations, then caches the results locally for quicker lookup.
 *
 * @property {Map} cachedOutput - Cached output of spawned shell-commands
 * @property {Map} cachedHashes - "Hashed" paths of programs in the user's $PATH
 * @property {Map} cachedFiles  - Files with content loaded by {@link fs.readFile}
 * @property {Map} cachedURLs   - Results of loading remote resources (HTTP/HTTPS)
 * @class
 */
class ShellCache{
	
	/**
	 * Construct a fresh instance with empty cache-maps.
	 *
	 * @param {Boolean} [noFreeze=false]
	 * @constructor
	 */
	constructor(noFreeze = false){
		this.cachedOutput = new Map();
		this.cachedHashes = new Map();
		this.cachedFiles  = new Map();
		this.cachedURLs   = new Map();
		this.exec         = this.exec.bind(this);
		this.which        = this.which.bind(this);
		this.loadFile     = this.loadFile.bind(this);
		this.loadURL      = this.loadURL.bind(this);
		noFreeze || Object.freeze(this);
	}
	
	
	/**
	 * Execute an external command.
	 *
	 * @example exec("sed", ["-e", "s/in/out/"], "input");
	 * @param {String} cmd - Executed command
	 * @param {String[]} args - List of arguments/switches
	 * @param {String} [inputData] - Data piped to stdin
	 * @param {String} [outputPath] - File to write stdout to
	 * @return {Promise} Resolves to an object
	 */
	async exec(cmd, args = [], inputData = "", outputPath = ""){
		
		// Reuse the output of an earlier identical call
		const cacheKey = [cmd, ...args].join(" ");
		let cached;
		if((cached = this.cachedOutput.get(cacheKey))
		&& (cached = cached.get(inputData)) != null)
			return cached;

		// Throw a hissy-fit if the requested command isn't available
		let cmdPath = await this.which(cmd);
		if(!cmdPath)
			throw new ReferenceError(`No such command: ${cmd}`);
		
		const fd = await (outputPath && new Promise((resolve, reject) => {
			open(outputPath, "w", (error, result) => error
				? reject(error)
				: resolve(result));
			}));
		const stdio = outputPath
			? ["pipe", fd, "pipe"]
			: "pipe";
		const proc = spawn(cmdPath, args, {stdio});
		
		let stdout = "";
		let stderr = "";
		if(inputData){
			proc.stdin.write(inputData, "utf8");
			proc.stdin.end();
		}
		if(!outputPath){
			proc.stdout.setEncoding("utf8");
			proc.stdout.on("data", data => stdout += data);
		}
		proc.stderr.setEncoding("utf8");
		proc.stderr.on("data", data => stderr += data);
		const output = await new Promise((resolve, reject) => {
			proc.on("close", code => resolve({code, stdout, stderr}));
			proc.on("error", error => reject(error));
		});
		
		cached = this.cachedOutput.get(cacheKey);
		if(!cached)
			this.cachedOutput.set(cacheKey, cached = new Map());
		cached.set(inputData, output);
		return output;
	}
	

	/**
	 * Asynchronously read a file.
	 * 
	 * @param {String} path
	 * @param {String} [encoding="utf8"]
	 * @param {Boolean} [ignoreCache=false]
	 * @return {Promise}
	 */
	async loadFile(path, encoding = "utf8", ignoreCache = false){
		
		// Reuse cache if possible
		let data = "";
		if(!ignoreCache && null != (data = this.cachedFiles.get(path)))
			return data;
		
		data = (await new Promise((resolve, reject) => {
			readFile(path, {encoding}, (error, data) => error
				? reject(error)
				: resolve(data));
		})).toString();
		ignoreCache || this.cachedFiles.set(path, data);
		return data;
	}


	/**
	 * Asynchronously load a resource over HTTP or HTTPS.
	 *
	 * @example loadURL("https://example.com/");
	 * @param {String} url
	 * @param {String} [encoding="utf8"]
	 * @param {Boolean} [ignoreCache=false]
	 * @return {Promise}
	 */
	async loadURL(url, encoding = "utf8", ignoreCache = false){
		
		// Reuse cache if possible
		let data = "";
		if(!ignoreCache && null != (data = this.cachedURLs.get(url)))
			return data;
		
		// Determine protocol of resource (HTTPS or HTTP)
		const protocol = url.match(/^https?(?=:\/{2}\S)/i);
		if(!protocol)
			throw new URIError(`Expected HTTPS/HTTP URL, got: ${url}`);

		const {get} = require(protocol[0].toLowerCase());
		data = (await new Promise((resolve, reject) => {
			const request = get(url, response => {
				if(response.statusMessage !== "OK")
					return reject(response);
				encoding && response.setEncoding(encoding);
				response.on("data", s => data += s);
				response.on("end", () => resolve(data));
			});
			request.on("error", e => reject(e));
		})).toString();
		ignoreCache || this.cachedURLs.set(url, data);
		return data;
	}


	/**
	 * Locate the path(s) for an executable in the user's $PATH.
	 *
	 * Results are hashed (cached) for quicker lookup.
	 *
	 * @example which("curl") => "/usr/bin/curl"
	 * @param {String} name
	 * @param {Boolean} [ignoreCache=false]
	 * @return {Promise}
	 */
	async which(name, ignoreCache = false){
		if(!name) return "";

		let hashes;
		if(!ignoreCache && (hashes = this.cachedHashes.get(name)))
			return hashes[0] || "";

		const cmdStr = "win32" === process.platform
			? `@for %g in (ECHO ${name.replace(/%/g, "%%")}) do`
				+ " @for %e in (%PATHEXT%) do"
				+ " @for %i in (%g%e) do "
				+ ' @if NOT "%~$PATH:i"=="" echo %~$PATH:i'
			: `command -v '${name.replace(/'/g, `'"'"'`)}' 2>/dev/null`;
		
		hashes = await new Promise((resolve, reject) =>
			exec(cmdStr, {windowsHide: true}, (error, output) => error
				? resolve("")
				: resolve(output)));
		
		hashes = hashes.split(/\r?\n/).filter(Boolean);
		ignoreCache || this.cachedHashes.set(name, hashes);
		return hashes[0] || "";
	}
}

module.exports = ShellCache;