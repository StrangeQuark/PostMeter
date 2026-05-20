function defineLazyModule(target, name, loader) {
  Object.defineProperty(target, name, {
    enumerable: true,
    get() {
      return loader();
    }
  });
}

module.exports = {
  defineLazyModule
};
