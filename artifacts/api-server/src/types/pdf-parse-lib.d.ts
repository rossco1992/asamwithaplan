// pdf-parse@1.1.1's main index runs test code at import time when `module.parent`
// is falsy (which is always the case in a bundled ESM entry point). We import the
// internal lib path directly to avoid that side effect. This declaration re-exports
// the same types that @types/pdf-parse provides for the public package so the
// internal path is fully typed.
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdfParse from "pdf-parse";
  export default pdfParse;
}
