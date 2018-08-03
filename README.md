Roff.js
=======

This is a collection of tools for integrating [Troff output](https://linux.die.net/man/7/ditroff) with JavaScript.
It is *not* a module for parsing Roff source. Don't ever be tempted to write one, either.
Stick to a standard Troff implementation like
[Groff](https://www.gnu.org/software/groff/) or
[Heirloom Doctools](http://n-t-roff.github.io/heirloom/doctools.html).

This version is an early pre-release, still in alpha and prone to many changes.


Postprocessors included
-----------------------
*	### `canvas`
	Uses [HTML5 canvas](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D)
	technology to render PDF documents generated by `gropdf` (or its equivalent).

*	### `html-tty`
	Generate an HTML-based rendition of monospaced terminal output,
	replicating the look of a document formatted with `nroff`.


Both of these will eventually see use in an (unfinished) [extension](https://github.com/Alhadis/language-roff/issues)
for the [Atom editor](http://atom.io/).


Postprocessors planned
----------------------
*	### `markdown`
	Lossy conversion to [CommonMark](http://commonmark.org/), with optional GFM-specific features.
	Includes automated uploading and embedding of embedded SVGs (which
	requires the [`gist`](https://github.com/defunkt/gist) tool for uploads).

*	### `rst`
	Lossy conversion to [reStructuredText](http://docutils.sourceforge.net/rst.html),
	another lightweight markup language with significantly more features than Markdown.

*	### `svg`
	Render a document or Pic drawing as an SVG image

*	### `plainhtml`
	A barest-possible representation of an HTML5 document, composed only of semantic and
	structured markup. This output is ideal for generating skeleton documents,
	or for (re-)generating documentation that an existing stylesheet will handle.
