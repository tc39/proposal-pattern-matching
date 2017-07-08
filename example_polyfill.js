if (!Symbol.matches) {
  const DEFINE_PROPERTY = "defineProperty";

  // define Symbol.matches
  Object[DEFINE_PROPERTY](Symbol, "matches", {
    configurable: false,
    writable: false,
    value: Symbol("matches"),
  });

  function defineMatch(O, fn) {
    Object[DEFINE_PROPERTY](O, Symbol.matches, {
      writable:     false,
      configurable: false,
      enumerable:   false,
      value:        fn
    });
  }

  // Classes
  defineMatch(Function.prototype, function (x) {
    return x instanceof this;
  });

  // Primitive Classes
  defineMatch(Number, function (x) {
    return typeof x === "number";
  });
  defineMatch(String, function (x) {
    return typeof x === "string";
  });
  defineMatch(Boolean, function (x) {
    return typeof x === "boolean";
  });

  // RegExp
  defineMatch(RegExp.prototype, function (x) {
    return this.test(x);
  });

  // Sets
  defineMatch(Set.prototype, function (x) {
    return this.has(x);
  });
}

function isMatch(pattern, x) {
  return Boolean(
    x != null && pattern != null && Symbol.matches in pattern
    ? pattern[Symbol.matches](x)
    : x === pattern
  );
}
