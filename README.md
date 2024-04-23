# ECMAScript Pattern Matching

## [Status](https://tc39.github.io/process-document/)

**Stage**: 1

**Spec Text**: <https://tc39.github.io/proposal-pattern-matching>

**Authors**: Originally Kat Marchán (Microsoft,
[@zkat\_\_](https://twitter.com/zkat__)); now, the below champions.

**Champions**: (in alphabetical order)

- Daniel Rosenwasser (Microsoft,
  [@drosenwasser](https://twitter.com/drosenwasser))
- Jack Works (Sujitech, [@Jack-Works](https://github.com/Jack-Works))
- Jordan Harband ([@ljharb](https://twitter.com/ljharb))
- Mark Cohen (Netflix, [@mpcsh\_](https://twitter.com/mpcsh_))
- Ross Kirsling (Sony, [@rkirsling](https://twitter.com/rkirsling))
- Tab Atkins-Bittner (Google, [@tabatkins](https://twitter.com/tabatkins))

# Introduction

## Problem

There are many ways to match *values* in the language,
but there are no ways to match *patterns*
beyond regular expressions for strings.
However, wanting to take different actions
based on patterns in a given value
is a very common desire:
do X if the value has a `foo` property,
do Y if it contains three or more items,
etc.

### Current Approaches

`switch` has the desired *structure* --
a value is given,
and several possible match criteria are offered,
each with a different associated action.
But it's severely lacking in practice:
it may not appear in expression position;
an explicit `break` is required in each `case` to avoid accidental fallthrough;
scoping is ambiguous
(block-scoped variables inside one `case` are available in the scope of the others,
unless curly braces are used);
the only comparison it can do is `===`; etc.

`if/else` has the necessary *power*
(you can perform any comparison you like),
but it's overly verbose even for common cases,
requiring the author to explicitly list paths into the value's structure multiple times,
once per test performed.
It's also statement-only
(unless the author opts for the harder-to-understand ternary syntax)
and requires the value under test to be stored in a (possibly temporary) variable.

## Priorities for a solution

This section details this proposal’s priorities. Note that not every champion
may agree with each priority.

### _Pattern_ matching

The pattern matching construct is a full conditional logic construct that can do
more than just pattern matching. As such, there have been (and there will be
more) trade-offs that need to be made. In those cases, we should prioritize the
ergonomics of structural pattern matching over other capabilities of this
construct.

### Subsumption of `switch`

This feature must be easily searchable, so that tutorials and documentation are
easy to locate, and so that the feature is easy to learn and recognize. As such,
there must be no syntactic overlap with the `switch` statement.

This proposal seeks to preserve the good parts of `switch`, and eliminate any
reasons to reach for it.

### Be better than `switch`

`switch` contains a plethora of footguns such as accidental case fallthrough and
ambiguous scoping. This proposal should eliminate those footguns, while also
introducing new capabilities that `switch` currently can not provide.

### Expression semantics

The pattern matching construct should be usable as an expression:

- `return match { ... }`
- `let foo = match { ... }`
- `() => match { ... }`
- etc.

The value of the whole expression is the value of whatever [clause](#clause) is
matched.

### Exhaustiveness and ordering

If the developer wants to ignore certain possible cases, they should specify
that explicitly. A development-time error is less costly than a production-time
error from something further down the stack.

If the developer wants two cases to share logic (what we know as "fall-through"
from `switch`), they should specify it explicitly. Implicit fall-through
inevitably silently accepts buggy code.

[Clauses](#clause) should always be checked in the order they’re written, i.e.
from top to bottom.

### User extensibility

Userland objects should be able to encapsulate their own matching semantics,
without unnecessarily privileging builtins. This includes regular expressions
(as opposed to the literal pattern syntax), numeric ranges, etc.

## Prior Art

This proposal adds a pattern matching expression to the language, based in part
on the existing
[Destructuring Binding Patterns](https://tc39.github.io/ecma262/#sec-destructuring-binding-patterns).

This proposal was approved for Stage 1 in the May 2018 TC39 meeting, and slides
for that presentation are available
[here](https://docs.google.com/presentation/d/1WPyAO4pHRsfwGoiIZupz_-tzAdv8mirw-aZfbxbAVcQ).
Its current form was presented to TC39 in the April 2021 meeting
([slides](https://hackmd.io/@mpcsh/HkZ712ig_#/)).

This proposal draws from, and partially overlaps with, corresponding features in
[CoffeeScript](https://coffeescript.org/#switch),
[Rust](https://doc.rust-lang.org/1.6.0/book/patterns.html),
[Python](https://www.python.org/dev/peps/pep-0622/),
[F#](https://docs.microsoft.com/en-us/dotnet/fsharp/language-reference/pattern-matching),
[Scala](http://www.scala-lang.org/files/archive/spec/2.11/08-pattern-matching.html),
[Elixir/Erlang](https://elixir-lang.org/getting-started/pattern-matching.html),
[Gleam](https://tour.gleam.run/flow-control/case-expressions),
and [C++](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2020/p1371r2.pdf).

### Userland matching

A list of community libraries that provide similar matching functionality:

- [Optionals](https://github.com/OliverBrotchie/optionals) — Rust-like error handling, options and exhaustive pattern matching for TypeScript and Deno
- [ts-pattern](https://github.com/gvergnaud/ts-pattern) — Exhaustive Pattern Matching library for TypeScript, with smart type inference.
- [babel-plugin-proposal-pattern-matching](https://github.com/iptop/babel-plugin-proposal-pattern-matching) — Minimal grammar, high performance JavaScript pattern matching implementation.
- [match-iz](https://github.com/shuckster/match-iz) — A tiny functional pattern-matching library inspired by the TC39 proposal.
- [patcom](https://github.com/concept-not-found/patcom) — Feature parity with TC39 proposal without any new syntax

# Specification

This proposal introduces three new concepts to Javascript:

* the "matcher pattern",
    a new DSL closely related to destructuring patterns,
    which allows recursively testing the structure and contents of a value
    in multiple ways at once,
    and extracting some of that structure into local bindings at the same time
* the `match(){}` expression,
    a general replacement for the `switch` statement
    that uses matcher patterns
    to resolve to one of several values,
* the `is` boolean operator,
    which allows for one-off testing of a value against a matcher pattern,
    potentially also introducing bindings from that test into the local environment.


# Matcher Patterns

Matcher patterns are a new DSL,
closely inspired by destructuring patterns,
for recursively testing the structure and contents of a value
while simultaneously extracting some parts of that value
as local bindings for use by other code.

Matcher patterns can be divided into three general varieties:
* Value patterns, which test that the subject matches some criteria, like "is the string `"foo"`" or "matches the variable `bar`".
* Structure patterns, which test the subject matches some structural criteria like "has the property `foo`" or "is at least length 3", and also let you recursively apply additional matchers to parts of that structure.
* Combinator patterns, which let you match several patterns in parallel on the same subject, with simple boolean `and`/`or` logic.

## Value Matchers

There are several types of value patterns, performing different types of tests.

### Primitive Patterns

All primitive values and variable names can be used directly as matcher patterns,
representing a test that the subject matches the specified value,
using [`SameValue`](https://tc39.es/ecma262/#sec-samevalue) semantics
(except when otherwise noted).

For example, `1` tests that the subject is `SameValue` to `1`,
`"foo"` tests that it's `SameValue` to `"foo"`,
etc.

Specifically,
boolean literals,
numeric literals,
string literals,
untagged template literals,
and the null literal
can all be used.

* Numeric literals can additionally be prefixed with a `+` or `-` unary operator:
    `+` is a no-op (but see the note about `0`, below),
    but `-` negates the value,
    as you'd expect.
* Within the interpolation expressions of template literals,
    see [Bindings](#bindings) for details on what bindings are visible.

The one exception to `SameValue` matching semantics
is that the pattern `0` is matched using `SameValueZero` semantics.
`+0` and `-0` are matched with `SameValue`, as normal.
(This has the effect that an "unsigned" zero pattern
will match both positive and negative zero values,
while the "signed" zero patterns
will only match the appropriately signed zero values.)

(Additional notes for `SameValue` semantics:
it works "as expected" for NaN values,
correctly matching NaN values against NaN patterns;
it does not do any implicit type coercion,
so a `1` value will not match a `"1"` pattern.)

Note: No coercion takes place in these matches:
if you match against a string literal, for example,
your subject must already be a string
or else it'll automatically fail the match,
even if it would stringify to a matching string.

#### Examples

```js
```


### Variable Patterns

A variable pattern is a "ident expression": `foo`, `foo.bar`, `foo[bar]` etc.,
excluding those that are already primitives like `null`,
and optionally prefixed by a `+` or `-` unary operator.

A variable pattern resolves the identifier against the visible bindings
(see [Bindings](#bindings) for details),
and if it has a `+` or `-` prefix,
converts it to a number (via `toValue`)
and possibly negates it.
If the result is an object with a `Symbol.customMatcher` property,
or is a function,
then it represents a custom matcher test.
See [custom matchers](#custom-matchers) for details.
Otherwise, it represents a test that the subject is `SameValue` with the result,
similar to a [Primitive Pattern](#primitive-patterns).

Note: This implies that, for example,
a variable holding an array will only match that exact array,
via object equivalence;
it is not equivalent to an [array pattern](#array-patterns)
doing a structural match.

Note that several values which are often *thought of* as literals,
like `Infinity` or `undefined`,
are in fact bindings.
Since Primitive Patterns and Variable Patterns are treated largely identically,
the distinction can fortunately remain academic here.

Note: Just like with Primitive Patterns,
no coercion is performed on the subjects
(or on the pattern value,
except for the effect of `+`/`-`,
which is explicitly asking for a numeric coercion),
so the type has to already match.


#### Examples

```js
```


### Custom Matchers

If the object that the variable pattern resolves to
has a `Symbol.customMatcher` property in its prototype chain,
then it is a "custom matcher".

To determine whether the pattern matches or not,
the custom matcher function is invoked
with the subject as its first argument,
and an object with the key `"matchType"` set to `"boolean"`
as its second argument.

If it returns a truthy value
(one which becomes `true` when `!!` is used on it)
the match is successful;
otherwise,
the match fails.
If it throws,
it passes the error up.

Note: [Extractor patterns](#extractor-patterns) use the identical machinery,
but allow further matching against the returned value,
rather than being limited to just returning true/false.

#### Examples

```js
```


#### Built-in Custom Matchers

Several JS objects have custom matchers installed on them by default.

All of the classes for primitive types
(Boolean, String, Number, BigInt, Symbol)
expose a built-in Symbol.customMatcher static method,
matching if and only if the subject is
a primitive (or a boxed object) corresponding to that type
The return value of a successful match
(for the purpose of [extractor patterns](#extractor-patterns))
is an iterator containing the (possibly auto-unboxed) primitive value.

```js
class Boolean {
    static [Symbol.customMatcher](subject) {
        return typeof subject == "boolean";
    }
}
/* et cetera for the other primitives */
```

`Function.prototype` has a custom matcher
that checks if the function has an `[[IsClassConstructor]]` slot
(meaning it's the `constructor()` function from a `class` block);
if so, it tests whether the subject is an object of that class
(using brand-checking to verify, similar to `Array.isArray()`);
if not, it invokes the function as a predicate,
passing it the subject,
and returns the return value:

```js
/* roughly */
Function.prototype[Symbol.customMatcher] = function(subject) {
    if(isClassConstructor(this)) {
        return hasCorrectBrand(this, subject);
    } else {
        return this(subject);
    }
}
```

This way, predicate functions can be used directly as matchers,
like `x is upperAlpha`,
and classes can also be used directly as matchers
to test if objects are of that class,
like `x is Option.Some`.

`RegExp.prototype` has a custom matcher
that executes the regexp on the subject,
and matches if the match was successful:

```js
RegExp.prototype[Symbol.customMatcher] = function(subject, {matchType}) {
    const result = this.exec(subject);
    if(matchType == "boolean") return result;
    if(matchType == "extractor") return [result, ...result.slice(1)];
}
```

Note: We have two conflicting desires here:
(1) allow predicate functions to be used as custom matchers in a trivial way, and
(2) allow classes to be used as matchers in a trivial way.
The only way to do (1) is to put a custom matcher on `Function.prototype`
that invokes the function for you,
but this is *also* the only *normal* way to do (2),
since `Function.prototype` is the nearest common prototype to all classes
(save those that explicitly null out their prototype, of course).
The solution we hit on here --
having the `class{}` syntax install a default matcher if there's not one present --
mirrors the behavior of constructor methods,
and lets us have both behaviors cleanly.
However, if this is deemed unacceptable,
we could pursue other approaches,
like having a prefix keyword to indicate a "boolean predicate pattern"
so we can tell it apart from a custom matcher pattern.


### Regex Patterns

A regex pattern is a regex literal,
representing a test that the subject,
when stringified,
successfully matches the regex.

(Technically, this just invokes the `RegExp.prototype[Symbol.customMatcher]` method;
that is, `x is /foo/;` and `let re = /foo/; x is re;`
are identical in behavior wrt built-in fiddling.)

A regex pattern can be followed by a parenthesized pattern list,
identical to [extractor patterns](#extractor-patterns).
See that section for details on how this works.

#### Examples

```js
```


### Binding Patterns

A `let`, `const`, or `var` keyword followed by a valid variable name
(identical to binding statements anywhere else).
Binding patterns always match,
and additionally introduce a binding,
binding the subject to the given name
with the given binding semantics.


#### Binding Behavior Details

As with normal binding statements,
the bindings introduced by binding patterns
are established in the nearest block scope
(for `let`/`const`)
or the nearest function scope (for `var`).

Issue: Or in the obvious scope, when used in a for/while header or a function arglist.
Don't know the right term for this off the top of my head.

Bindings are established according to their *presence* in a pattern;
whether or not the binding pattern itself is ever executed is irrelevant.
(For example, `[1, 2] is ["foo", let foo]`
will still establish a `foo` binding in the block scope,
despite the first pattern failing to match
and thus skipping the binding pattern.)

Standard TDZ rules apply before the binding pattern is actually executed.
(For example, `when [x, let x]` is an early `ReferenceError`,
since the `x` binding has not yet been initialized
when the first pattern is run
and attempts to dereference `x`.)

Unlike standard binding rules,
within the scope of an entire top-level pattern,
a given name can appear in multiple binding patterns,
as long as all instances use the same binding type keyword.
It is a runtime `ReferenceError`
if more than one of these binding patterns actually execute, however
(with one exception - see [`or` patterns](#or-patterns)).
(This behavior has precedent:
it was previously the case that named capture groups
had to be completely unique within a regexp.
Now they're allowed to be repeated
as long as they're in different branches of an alternative,
like `/foo(?<part>.*)|(?<part>.*)foo/`.)


#### Examples

```js
(x or [let y]) and (z or {key: let y})
```

Valid at parse-time: both binding patterns name `y`
with `let` semantics.
This establishes a `y` binding in the nearest block scope.

If x *or* z matches, but not both,
then `y` gets bound appropriately.
If neither matches, `y` remains uninitialized
(so it's a runtime ReferenceError to use it).
If both match, a runtime ReferenceError is thrown
while executing the second `let y` pattern,
as its binding has already been initialized.

```js
(x or [let y]) and (z or {key: const y})
```
Early ReferenceError, as `y` is being bound twice
with differing semantics.

```js
x and let y and z and if(y == "foo")
```
Valid at parse-time, establishes a `y` binding in block scope.

If x doesn't match,
`y` remains uninitialized,
but the guard pattern is also skipped,
so no runtime error (yet).
If z doesn't match,
`y` is initialized to the match subject,
but the `if()` test never runs.

```js
[let x and String] or {length: let x}
```
Valid at parse-time, establishes an `x` binding.

[`or` pattern](#or-patterns) semantics allow overriding an already-initialized binding,
if that binding came from an earlier failed sub-pattern,
to avoid forcing authors to awkwardly arrange their binding patterns
after the fallible tests.

So in this example, if passed an object like `[5]`,
it will pass the initial length check,
execute the `let x` pattern and bind it to `5`,
then fail the `String` pattern,
as the subject is a `Number`.
It will then continue to the next `or` sub-pattern,
and successfully bind `x` to 1,
as the existing binding was initialized in a failed sub-pattern.



## Structure Patterns

Structure patterns let you test the structure of the subject
(its properties, its length, etc)
and then recurse into that structure with additional matcher patterns.

### Array Patterns

A comma-separated list of zero or more patterns, surrounded by square brackets.
It represents a test that:

1. The subject is iterable.
2. The subject contains exactly as many iteration items
  as the length of the array pattern.
3. Each item matches the associated sub-pattern.

For example, `["foo", {bar}]` will match
when the subject is an iterable with exactly two items,
the first item is the string `"foo"`,
and the second item has a `bar` property.

The final item in the array pattern can optionally be a "rest pattern":
either a literal `...`,
or a `...` followed by another pattern.
In either case, the presence of a rest pattern relaxes the length test
(2 in the list above)
to merely check that the subject has *at least* as many items
as the array pattern,
ignoring the rest pattern.
That is, `[a, b, ...]` will only match a subject
who contains 2 or more items.

If the `...` is followed by a pattern,
like `[a, b, ...let c]`,
then the iterator is fully exhausted,
all the leftover items are collected into an `Array`,
and that array is then applied as the subject of the rest pattern's test.

Note: The above implies that `[a, b]` will pull three items from the subject:
two to match against the sub-patterns,
and a third to verify that the subject doesn't *have* a third item.
`[a, b, ...]` will pull only two items from the subject,
to match against the sub-patterns.
`[a, b, ...c]` will exhaust the subject's iterator,
verifying it has at least two items
(to match against the sub-patterns)
and then pulling the rest to match against the rest pattern.

Array pattern execution order is as follows:

1. Obtain an iterator from the subject. Return failure if this fails.
2. For each expected item up to the number of sub-patterns (ignoring the rest pattern, if present):
    1. Pull one item from the iterator. Return failure if this fails.
    2. Execute the corresponding pattern. Return failure if this doesn't match.
3. If there is no rest pattern, pull one more item from the iterator, verifying that it's a `{done: true}` result. If so, return success; if not, return failure.
4. If there is a `...` rest pattern, return success.
5. If there is a `...<pattern>` rest pattern, pull the remaining items of the iterator into a fresh `Array`, then match the pattern against that. If it matches, return success; otherwise return failure.

Issue: Or should we pull all the necessary values from the iterator first,
*then* do all the matchers?

#### Examples

```js
match (res) {
  when isEmpty: ...;
  when {data: [let page] }: ...;
  when {data: [let frontPage, ...let pages] }: ...;
  default: ...;
}
```

[**Array patterns**](#array-patterns) implicitly check the length of the subject.

The first arm is a [variable pattern](#variable-patterns),
invoking the default `Function.prototype` custom matcher
which calls `isEmpty(res)`
and matches if that returns `true`.

The second arm is an [object pattern](#object-patterns)
which contains an [array pattern](#array-patterns),
which matches if `data` has exactly one element,
and binds that element to `page` for the RHS.

The third arm matches if `data` has **at least one** element,
binding that first element to `frontPage`,
and binding an array of any remaining elements to `pages`
using a rest pattern.


#### Array Pattern Caching

To allow for idiomatic uses of generators
and other "single-shot" iterators
to be reasonably matched against several array patterns,
the iterators and their results are cached over the scope of the match construct.

Specifically, whenever a subject is matched against an array pattern,
the subject is used as the key in a cache,
whose value is the iterator obtained from the subject,
and all items pulled from the subject by an array pattern.

Whenever something would be matched against an array pattern,
the cache is first checked,
and the already-pulled items stored in the cache are used for the pattern,
with new items pulled from the iterator only if necessary.

For example:

```js
function* integers(to) {
  for(var i = 1; i <= to; i++) yield i;
}

const fiveIntegers = integers(5);
match (fiveIntegers) {
  when [let a]:
    console.log(`found one int: ${a}`);
    // Matching a generator against an array pattern.
    // Obtain the iterator (which is just the generator itself),
    // then pull two items:
    // one to match against the `a` pattern (which succeeds),
    // the second to verify the iterator only has one item
    // (which fails).
  when [let a, let b]:
    console.log(`found two ints: ${a} and ${b}`);
    // Matching against an array pattern again.
    // The generator object has already been cached,
    // so we fetch the cached results.
    // We need three items in total;
    // two to check against the patterns,
    // and the third to verify the iterator has only two items.
    // Two are already in the cache,
    // so we’ll just pull one more (and fail the pattern).
  default: console.log("more than two ints");
}
console.log([...fiveIntegers]);
// logs [4, 5]
// The match construct pulled three elements from the generator,
// so there’s two leftover afterwards.
```

When execution of the match construct finishes, all cached iterators are closed.


### Object Patterns

A comma-separated list of zero or more "object pattern clauses", wrapped in curly braces.
Each "object pattern clause" is either `<key>`, `let/var/const <ident>` or `<key>: <pattern>`,
where `<key>` is an identifier or a computed-key expression like `[Symbol.foo]`.
It represents a test that the subject:

1. Has every specified property in its prototype chain.
2. If the key has an associated sub-pattern,
    then the value of that property matches the sub-pattern.

A `<key>` object pattern clause
is exactly equivalent to `<key>: void`.
A `let/var/const <ident>` object pattern clause
is exactly equivalent to `<ident>: let/var/const <ident>`.

That is, `when {foo, let bar, baz: "qux"}`
is equivalent to `when {foo: void, bar: let bar, baz: "qux"}`:
it tests that the subject has `foo`, `bar`, and `baz` properties,
introduces a `bar` binding for the value of the `bar` property,
and verifies that the value of the `baz` property is the string `"qux"`.

Additionally, object patterns can contain a "rest pattern":
a `...` followed by a pattern.
Unlike array patterns, a lone `...` is not valid in an object pattern
(since there's no strict check to relax).
If the rest pattern exists,
then all *enumerable own properties*
that aren't already matched by object pattern clauses
are collected into a fresh object,
which is then matched against the rest pattern.
(This matches the behavior of object destructuring.)

Issue: Do we want a `key?: pattern` pattern clause as well?
Makes it an optional test -
*if* the subject has this property,
verify that it matches the pattern.
If the pattern is skipped because the property doesn't exist,
treat any bindings coming from the pattern
the same as ones coming from skipped `or` patterns.

Issue: Ban `__proto__`? Do something funky?

Object pattern execution order is as follows:

1. For each non-rest object pattern clause `key: sub-pattern`, in source order:
    1. Check that the subject has the property `key` (using `in`, or `HasProperty()`, semantics). If it doesn't, return failure.
    2. Get the value of the `key` property, and match it against `sub-pattern`. If that fails to match, return failure.
2. If there's a rest pattern clause,
    collect all enumerable own properties of the subject
    that weren't tested in the previous step,
    and put them into a fresh `Object`.
    Match that against the rest pattern.
    If that fails, return failure.
3. Return success.

#### Examples

```js
```

#### Object Pattern Caching

Similar to [array pattern caching](#array-pattern-caching),
object patterns cache their results over the scope of the match construct,
so that multiple clauses don’t observably retrieve the same property multiple times.

(Unlike array pattern caching,
which is necessary for this proposal to work with iterators,
object pattern caching is a nice-to-have.
It does guard against some weirdness like non-idempotent getters
(including, notably, getters that return iterators),
and helps make idempotent-but-expensive getters usable in pattern matching
without contortions,
but mostly it’s just for conceptual consistency.)

Whenever a subject is matched against an object pattern,
for each property name in the object pattern,
a `(<subject>, <property name>)` tuple is used as the key in a cache,
whose value is the value of the property.

Whenever something would be matched against an object pattern,
the cache is first checked,
and if the subject and that property name are already in the cache,
the value is retrieved from cache instead of by a fresh Get against the subject.

For example:

```js
const randomItem = {
  get numOrString() { return Math.random() < .5 ? 1 : "1"; }
};

match (randomItem) {
  when {numOrString: Number}:
    console.log("Only matches half the time.");
    // Whether the pattern matches or not,
    // we cache the (randomItem, "numOrString") pair
    // with the result.
  when {numOrString: String}:
    console.log("Guaranteed to match the other half of the time.");
    // Since (randomItem, "numOrString") has already been cached,
    // we reuse the result here;
    // if it was a string for the first clause,
    // it’s the same string here.
}
```

Issue: This potentially introduces a lot more caching,
and the major use-case is just making sure that iterator caching
works both at the top-level and when nested in an object.
Expensive or non-idempotent getters benefit,
but that's a much less important benefit.
This caching *is* potentially droppable,
but it will mean that we only cache iterables at the top level.

### Extractor Patterns

A dotted-ident followed by a parenthesized "argument list"
containing the same syntax as an [array matcher](#array-matcher).
Represents a combination of a [custom matcher pattern](#custom-matcher-pattern)
and an [array pattern](#array-patterns):

1. The dotted-ident is resolved against the visible bindings.
    If that results in an object with a `Symbol.customMatcher` property,
    and the value of that property is a function,
    then continue;
    otherwise, this throws an XXX error.

2. The custom matcher function is invoked with the subject as its first argument,
    and an object with the key `"matchType"` set to `"extractor"`
    as its second argument.
    Let <var>result</var> be the return value.

3. Match <var>result</var> against the [arglist pattern](#arglist-patterns).

Note: While [custom matchers](#custom-matchers) only require the return value be *truthy* or *falsey*,
extractor patterns are stricter about types:
the value must be *exactly* `true` or `false`,
or an `Array`,
or an iterable.

#### Arglist Patterns

An arglist pattern is a sub-pattern of an Extractor Pattern,
and is mostly identical to an [Array Pattern](#array-patterns).
It has identical syntax,
except it's bounded by parentheses (`()`)
rather than square brackets (`[]`).
It behaves slightly differently with a few subjects, as well:

* a `false` subject always fails to match
* a `true` subject matches as if it were an empty Array
* an `Array` subject is matched per-index,
    rather than invoking the iterator protocol.

If the subject is an `Array`,
then it's matched as follows:

1. If the arglist pattern doesn't end in a rest pattern,
    then the subject's `length` property must exactly equal
    the length of the pattern,
    or it fails to match.

2. If the arglist pattern *does* end in a rest pattern,
    then the subject's `length` property must be equal or greater
    than the length of the pattern - 1,
    or it fails to match.

3. For each non-rest sub-pattern of the arglist pattern,
    the corresponding integer-valued property of the subject is fetched,
    and matched against the corresponding sub-pattern.

4. If the final sub-pattern is a `...<pattern>`,
    collect the remaining integer-valued properties of the subject,
    up to but not including its `length` value,
    into a fresh Array,
    and match against that pattern.

5. If any of the matches failed,
    the entire arglist pattern fails to match.
    Otherwise, it succeeds.

Other than the above exceptions,
arglist patterns are matched
exactly the same as array patterns.

Issue: Do we cache arglists the same way we cache array patterns?

Note: The `Array` behavior here
is for performance, based on implementor feedback.
Invoking the iterator protocol is expensive,
and we don't want to discourage use of custom matchers
when the *by far* expected usage pattern
is to just return an `Array`,
rather than some more complex iterable.
We're (currently) still sticking with iterator protocol for array matchers,
to match destructuring,
but could potentially change that.



#### Examples

```js
class Option {
  constructor() { throw new TypeError(); }
  static Some = class extends Option {
    constructor(value) { this.value = value; }
    map(cb) { return new Option.Some(cb(this.value)); }
    // etc
    static [Symbol.customMatcher](subject) {
      if (subject instanceof Option.Some) { return [subject.value]; }
      return false;
    }
  };

  static None = class extends Option {
    constructor() { }
    map(cb) { return this; }
    // Use the default custom matcher,
    // which just checks that the subject matches the class.
  };
}

let val = Option.Some(5);
match(val) {
  when Object.Some(String and let a): console.log(`Got a string "${a}".`);
  when Object.Some(Number and let a): console.log(`Got a number ${a}.`);
  when Object.Some(...): console.log(`Got something unexpected.`);
  // Or `Object.Some`, either works.
  // `Object.Some()` will never match, as the return value
  // is a 1-item array, which doesn't match `[]`
  when Object.None(): console.log(`Operation failed.`);
  // or `Object.None`, either works
  default: console.log(`Didn't get an Option at all.`)
}
```

Issue: We don't have an easy way to get access to the "built-in" custom matcher,
so the above falls back to doing an instanceof test
(rather than the technically more correct branding test
that the built-in one does).
To work "properly" I'd have to define the class without a custom matcher,
then pull off the custom matcher,
save it to a local variable,
and define a new custom matcher that invokes the original one
and returns the `[subject.value]` on success.
That's a silly amount of work for correctness.


### Regex Extractor Patterns

Similar to how [regex patterns](#regex-patterns)
allowed you to use a regex literal as a pattern,
but simply invoked the normal [custom matcher](#custom-matchers) machinery,
a regex literal can also be followed by an [arglist pattern](#arglist-patterns),
invoking the normal [extractor pattern](#extractor-patterns) machinery.

For this purpose,
on a successful match
the "return value" (what's matched against the arglist pattern)
is an Array whose items are the regex result object,
followed by each of the positive numbered groups in the regex result
(that is, skipping the "0" group that represents the entire match).

Execution order is identical to [extractor patterns](#extractor-patterns),
except the first part is matched as a [regex pattern](#regex-patterns),
and the second part's subject is as defined above.

The full definition of the `RegExp.prototype` custom matcher is thus:

```js
RegExp.prototype[Symbol.customMatcher] = function(subject) {
    const result = this.exec(subject);
    if(result) {
        return [result, ...result.slice(1)];
    } else {
        return false;
    }
}
```

#### Examples

```js
match (arithmeticStr) {
  when /(?<left>\d+) \+ (?<right>\d+)/({groups:{let left, let right}}):
    // Using named capture groups
    processAddition(left, right);
  when /(\d+) \* (\d+)/({}, let left, let right):
    // Using positional capture groups
    processMultiplication(left, right);
  default: ...
}
```


## Combinator Patterns

Sometimes you need to match multiple patterns on a single value,
or pass a value that matches any of several patterns,
or just negate a pattern.
All of these can be achieved with combinator patterns.

### And Patterns

Two or more patterns, each separated by the keyword `and`.
This represents a test
that the subject passes *all* of the sub-patterns.
Any pattern can be
(and in some cases must be, see [combining combinators](#combining-combinator-patterns))
wrapped in parentheses.

Short-circuiting applies; if any sub-pattern fails to match the subject,
matching stops immediately.

`and` pattern execution order is as follows:

1. For each sub-pattern, in source order, match the subject against the sub-pattern. If that fails to match, return failure.
2. Return success.


### Or Patterns

Two or more patterns, each separated by the keyword `or`.
This represents a test
that the subject passes *at least one* of the sub-patterns.
Any pattern can be
(and in some cases must be, see [combining combinators](#combining-combinator-patterns))
wrapped in parentheses.

Short-circuiting applies; if any sub-pattern successfully matches the subject,
matching stops immediately.

`or` pattern execution order is as follows:

1. For each sub-pattern, in source order, match the subject against the sub-pattern. If that successfully matches, return success.
2. Return failure.

Note: As defined in [Binding Behavior Details](#binding-behavior-details),
a [binding pattern](#binding-patterns) in a failed sub-pattern
can be overridden by a binding pattern in a later sub-pattern
without error.
That is, `[let foo] or {length: let foo}` is valid
both at parse-time and run-time,
even tho the `foo` binding is potentially initialized twice
(given a subject like `[1, 2]`).


### Not Patterns

A pattern preceded by the keyword `not`.
This represents a test that the subject *does not* match the sub-pattern.
The pattern can be
(and in some cases must be, see [combining combinators](#combining-combinator-patterns))
wrapped in parentheses.


### Combining Combinator Patterns

Combinator patterns cannot be combined at the same "level";
there is no precedence relationship between them.
Instead, parentheses must be used to explicitly provide an ordering.

That is, `foo and bar or baz` is a syntax error;
it must be written `(foo and bar) or baz`
or `foo and (bar or baz)`.

Similarly, `not foo and bar` is a syntax error;
it must be written `(not foo) and bar`
or `not (foo and bar)`.


## Guard Patterns

A guard pattern has the syntax `if(<expression>)`,
and represents a test that the expression is truthy.
This is an arbitrary JS expression,
*not* a pattern.



# `match` expression

`match` expressions are a new type of expression
that makes use of [patterns](#patterns)
to select one of several expressions to resolve to.

A match expression looks like:

```js
match(<subject-expression>) {
    when <pattern>: <value-expression>;
    when <pattern>: <value-expression>;
    ...
    default: <value-expression>;
}
```

That is, the `match` head contains a `<subject-expression>`,
which is an arbitrary JS expression
that evaluates to a "subject".

The `match` block contains zero or more "match arms",
consisting of:
* the keyword `when`
* a [pattern](#patterns)
* a literal colon
* an arbitrary JS expression
* a semicolon (yes, required)

After the match arms,
it can optionally contain default a "default arm",
consisting of:
* the keyword `default`
* a literal colon
* an arbitrary JS expression
* a semicolon

After obtaining the subject,
each match arm is tested in turn,
matching the subject against the arm's pattern.
If the match is successful,
the arm's expression is evaluated,
and the `match` expression resolves to that result.

If all match arms fail to match,
and there is a default arm,
the default arm's expression is evaluated,
and the `match` expression resolves to that result.
If there is no default arm,
the `match` expression throws a `TypeError`.

## Bindings

The `<subject-expression>` is part of the nearest block scope.

Each match arm and the default arm
are independent nested block scopes,
covering both the pattern and the expression of the arm.
(That is, different arms can't see each other's bindings,
and the bindings don't escape the `match` expression.
Within each arm, they shadow the outer scope's bindings.)

## Examples

```jsx
match (res) {
  when { status: 200, let body, ...let rest }: handleData(body, rest);
  when { const status, destination: let url } and if (300 <= status && status < 400):
    handleRedirect(url);
  when { status: 500 } and if (!this.hasRetried): do {
    retry(req);
    this.hasRetried = true;
  };
  default: throwSomething();
}
```

This example tests a "response" object against several patterns,
branching based on the `.status` property,
and extracting different parts from the response in each branch
to process in various handler functions.

-----

```js
match (command) {
  when ['go', let dir and ('north' or 'east' or 'south' or 'west')]: go(dir);
  when ['take', /[a-z]+ ball/ and {let weight}: takeBall(weight);
  default: lookAround()
}
```

This sample is a contrived parser for a text-based adventure game.

The first match arm matches if the command is an array with exactly two items.
The first must be exactly the string `'go'`,
and the second must be one of the given cardinal directions.
Note the use of the [**and pattern**](#and-patterns)
to bind the second item in the array to `dir`
using a [**binding pattern**](#binding-patterns)
before verifying (using the [or pattern](#or-patterns))
that it’s one of the given directions.

The second match arm is slightly more complex.
First, a [regex pattern](#regex-patterns) is used
to verify that the object stringifies to `"something ball"`,
then an [object patterns](#object-patterns)
verifies that it has a `.weight` property
and binds it to `weight`,
so that the weight is available to the arm's expression.

## Statement vs Expression

For maximum expressivity,
the `match` expression is an expression, not a statement.
This allows for easy use in expression contexts
like `return match(val){...}`.

It can, of course, be used in statement context,
as in the first example above.
However, the match arms still contain expressions only.

It is *expected* that do-expressions will allow
for match arms to execute statements
(again, as in the first example above).
If that proposal does not end up advancing,
a future iteration of this proposal will include some way
to have a match arm contain statements.
(Probably just by inlining do-expr's functionality.)

# `is` operator

The `is` operator is a new boolean operator,
of the form `<subject-expression> is <pattern>`.
It returns a boolean result,
indicating whether the subject matched the pattern or not.

## Bindings

Bindings established in the pattern of an `is`
are visible in the nearest block scope,
as defined in [Binding Patterns](#binding-patterns).

This includes when used in the head of an `if()` statement:

```js
function foo(x) {
    if(x is [let head, ...let rest]) {
        console.log(head, rest);
    } else {
        // `head` and `rest` are defined here,
        // but will throw a ReferenceError if dereferenced,
        // since if the pattern failed
        // the binding patterns must not have been executed.
    }
}

function bar(x) {
    if(x is not {let necessaryProperty}) {
        // Pattern succeeded, because `x.necessaryProperty`
        // doesn't exist.
        return;
    }
    // Here the pattern failed because `x.necessaryProperty`
    // *does* exist, so the binding pattern was executed,
    // and the `necessaryProperty` binding is visible here.
    console.log(necessaryProperty);
}
```

When used in the head of a `for()`,
the usual binding scopes apply:
the bindings are scoped to the `for()` head+block,
and in the case of `for-of`,
are copied to the inner per-iteration binding scopes.

`while` and `do-while` do not currently have any special scoping rules
for things in their heads.
We propose that they adopt the same rules as `for-of` blocks:
the head is in a new scope surrounding the rule,
and its bindings are copied to a per-iteration scope
surrounding the `{}` block.
For do-while,
the bindings are TDZ on the first iteration,
before the head is executed.






# Motivating examples

Below are selected situations where we expect pattern matching will be widely
used. As such, we want to optimize the ergonomics of such cases to the best of
our ability.

------

Validating JSON structure.

Here's the simple destructuring version of the code,
which does zero checks on the data ahead of time,
just pulls it apart and hopes everything is correct:

```js
var json = {
  'user': ['Lily', 13]
};
var {user: [name, age]} = json;
print(`User ${name} is ${age} years old.`);
```

Destructuring with checks that everything is correct and of the expected shape:

```js
if ( json.user !== undefined ) {
  var user = json.user;
  if (Array.isArray(user) &&
      user.length == 2 &&
      typeof user[0] == "string" &&
      typeof user[1] == "number") {
    var [name, age] = user;
    print(`User ${name} is ${age} years old.`);
  }
}
```

Exactly the same checks, but using pattern-matching:

```js
if( json is {user: [String and let name, Number and let age]} ) {
  print(`User ${name} is ${age} years old.`);
}
```

------

Matching `fetch()` responses:

```jsx
const res = await fetch(jsonService)
match (res) {
  when { status: 200, headers: { 'Content-Length': let s } }:
    console.log(`size is ${s}`);
  when { status: 404 }:
    console.log('JSON not found');
  when { let status } and if (status >= 400): do {
    throw new RequestError(res);
  }
};
```

---

More concise, more functional handling of Redux reducers (compare with
[this same example in the Redux documentation](https://redux.js.org/basics/reducers#splitting-reducers)):

```jsx
function todosReducer(state = initialState, action) {
  return match (action) {
    when { type: 'set-visibility-filter', payload: let visFilter }:
      { ...state, visFilter };
    when { type: 'add-todo', payload: let text }:
      { ...state, todos: [...state.todos, { text, completed: false }] };
    when { type: 'toggle-todo', payload: let index }: do {
      const newTodos = state.todos.map((todo, i) => {
        return i !== index ? todo : {
          ...todo,
          completed: !todo.completed
        };
      });

      ({
        ...state,
        todos: newTodos,
      });
    }
    default: state // ignore unknown actions
  }
}
```

---

Concise conditional logic in JSX (via
[Divjot Singh](https://twitter.com/bogas04/status/977499729557839873)):

```jsx
<Fetch url={API_URL}>
  {props => match (props) {
    when {loading}: <Loading />;
    when {let error}: do {
      console.err("something bad happened");
      <Error error={error} />
    };
    when {let data}: <Page data={data} />;
  }}
</Fetch>
```


# Possible future enhancements

## Void Patterns

The keyword `void` is a pattern
that always matches,
and does nothing else.
It's useful in structure patterns,
when you want to test for the existence of a property
without caring what its value is.

This is the most likely proposal to move back into the main proposal;
it's pulled out solely because we want to make sure
that it stays consistent
with [Void Bindings](https://github.com/tc39/proposal-discard-binding).

## `async match`

If the `match` construct appears inside a context where `await` is allowed,
`await` can already be used inside it, just like inside `do` expressions.
However, just like `async do` expressions, there’s uses of being able to use
`await` and produce a Promise, even when not already inside an `async function`.

```js
async match (await subject) {
  when { let a }: await a;
  when { let b }: b.then(() => 42);
  default: await somethingThatRejects();
} // produces a Promise
```

## Relational Patterns

Currently there are patterns for expressing various types of equality,
and kinda an instanceof (for custom matchers against a class).
We could express more types of operator-based checks,
like:

```js
match(val) {
    when < 10: console.log("small");
    when >= 10 and < 20: console.log("mid");
    default: "large";
}
```

Generally, all the binary boolean operators could be used,
with the subject as the implicit LHS of the operator.

(This would slightly tie our hands on future syntax expansions for patterns,
but it's unlikely we'd ever *want* to reuse existing operators
in a way that's different from how they work in expression contexts.)

## Default Values

Destructuring can supply a default value with `= <expr>` which is used when a
key isn’t present. Is this useful for pattern matching?

Optional keys seem reasonable; right now they’d require duplicating the pattern
like `({a, b} or {a})` (`b` will be bound to undefined in the RHS if not present).

Do we need/want full defaulting? Does it complicate the syntax to much to have
arbitrary JS expressions there, without anything like wrapper characters to
distinguish it from surrounding patterns?

This would bring us into closer alignment with destructuring, which is nice.


## Destructuring enhancements

Both destructuring and pattern matching should remain in sync, so enhancements
to one would need to work for the other.

## Integration with `catch`

Allow a `catch` statement to conditionally catch an exception, saving a level of
indentation:

```js
try {
  throw new TypeError('a');
} catch match (e) {
  when RangeError: ...;
  when /^abc$/: ...;
  // unmatched, default to rethrowing e
}
```

Or possibly just allow an `is` check in the catch head:

```js
try {
  throw new TypeError('a');
} catch (e is RangeError) {
    ...
} catch (e is /^abc$/) {
    ...
}
```

(In both cases, the name used for the subject automatically creates a binding,
same as `catch (e)` does today.)

## Chaining guards

Some reasonable use-cases require repetition of patterns today, like:

```js
match (res) {
  when { status: 200 or 201, let pages, let data } and if (pages > 1):
    handlePagedData(pages, data);
  when { status: 200 or 201, let pages, let data } and if (pages === 1):
    handleSinglePage(data);
  default: handleError(res);
}
```

We might want to allow match constructs to be chained, where the child match
construct sees the bindings introduced in their parent clause, and which will
cause the entire parent clause to fail if none of the sub-classes match.

The above would then be written as:

```js
match (res) {
  when { status: 200 or 201, let data } match {
    when { pages: 1 }: handleSinglePage(data);
    when { pages: >= 2 and let pages }: handlePagedData(pages, data);
  };
  default: handleError(res);
  // runs if the status indicated an error,
  // or if the data didn't match one of the above cases,
  // notably if pages == 0
}
```

Note the lack of a `<subject-expression>` in the child (just `match {...}`), to
signify that it’s chaining from the `when` rather than just being part an
independent match construct in the RHS (which would, instead, throw if none of
the clauses match):

```js
match (res) {
  when { status: 200 or 201, let data }: match(res) {
    when { pages: 1}: handleSinglePage(data);
    when { pages: >= 2 and let pages}: handlePagedData(pages, data);
    // just an RHS, so if pages == 0,
    // the inner construct fails to match anything
    // and throws a TypeError
  };
  default: handleError(res);
}
```

The presence or absence of the separator colon also distinguishes these cases,
of course.


<!--
## Implementations

* [Babel Plugin](https://github.com/babel/babel/pull/9318)
* [Sweet.js macro](https://github.com/natefaubion/sparkler) (NOTE: this isn’t based on the proposal, this proposal is partially based on it!)
-->
