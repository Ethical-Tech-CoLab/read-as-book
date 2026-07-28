// page-flip (StPageFlip) ships no type declarations. We only touch it through a
// dynamic import inside flipbook.ts, where the surface we use is typed locally,
// so an opaque module declaration is enough — and it keeps `page-flip` out of
// our published .d.ts files, so consumers need no shim of their own.
declare module "page-flip";
