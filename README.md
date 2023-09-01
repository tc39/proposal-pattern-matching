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

## Table of Contents

- [Problem](#problem)
- [Priorities](#priorities-for-a-solution)
- [Prior Art](#prior-art)
- [Code Samples](#code-samples)
- [Motivating Examples](#motivating-examples)
- [Terminology/Proposal](#proposal)
- [Possible Future Enhancements](#possible-future-enhancements)

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
* Combinator patterns, which let you match several patterns in parallel on the same subject, with simple boolean and/or logic.

## Value Matchers

There are several types of value patterns, performing different types of tests.

### Primitive Pattern

All primitive values can be used directly as matcher patterns,
representing a test that the subject matches the specified value,
using [`SameValue`](https://tc39.es/ecma262/#sec-samevalue) semantics
(except when otherwise noted).

For example, `1` tests that the subject is `SameValue` to `1`,
`"foo"` tests that it's `SameValue` to `"foo"`,
etc.

Specifically, boolean literals, numeric literals, string literals, and the null literal
can all be used.

Additionally, several "near-literal" expressions can be used,
which represent expressions that function as literals to authors:

* `undefined`, matching the undefined value
* numeric literals preceded by an unary `+` or `-`, like `-1`
* `NaN`
* `Infinity` (with `+` or `-` prefixes as well)
* untagged template literals
  (See [Bindings](#bindings) for details on what bindings are visible
  to the interpolation expressions.)

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

Primitive patterns never introduce bindings.

#### Examples

```js
````


### Variable Patterns

A variable pattern is a "dotted ident": `foo`, `foo.bar`, etc.,
excluding those that are already primitives like `null`.
The syntax is meant to align with Decorators,
which does not allow `[]` access or other syntax by default.

Issue: Decoraters allows `@(...)` to let you run arbitrary expressions
to obtain a decorator.
Do we need something for this?
The previous `${...}` syntax allowed for it.
Or can we allow `[]` in the name?
Maybe just containing primitives, like `foo["can't write this with dotted syntax"]`?

A variable pattern resolves the identifier against the visible bindings
(see [Bindings](#bindings) for details).
If the result is an object with a `Symbol.customMatcher` property,
or is a function,
then it represents a custom matcher test.
See [custom matchers](#custom-matchers) for details.

Otherwise, it represents a test that the subject is `SameValue` with the result.

Note: This implies that, for example,
a variable holding an array will only match that exact array,
via object equivalence;
it is not equivalent to an [array pattern](#array-patterns)
doing a structural match.

Variable patterns never introduce bindings.


#### Examples

```js
````


### Custom Matchers

If the object that the variable pattern resolves to
either has a `Symbol.customMatcher` property in its prototype chain,
or is a function,
then it is a "custom matcher".

If the object has a `Symbol.customMatcher` property:
1. If that property's value is a function,
  then that function is the "custom matcher function".
2. Otherwise executing this matcher throws a TypeError.

Otherwise, if the object is a function,
it's the "custom matcher function".

To determine whether the pattern matches or not,
the custom matcher function is invoked
with the subject as its sole argument.
If it returns `true`,
or an object that is iterable,
the match is successful;
if it returns `false`,
the match fails;
if it returns anything else,
it throws an XXXError;
if it throws,
it passes the error up.

Note: [Extractor patterns](#extractor-patterns) use the identical machinery,
but allow further matching against the returned value,
rather than being limited to just returning true/false.

Note: In other words,
*any* boolean predicate is immediately usable as a custom matcher.

Issue: I'm being strict here about possible return values
to allow for safer future extension.
Is this the right way forward?
Or should I just do truthy/falsey,
so predicates that return useful non-boolean values can be used?
Or false for failure and everything else for success
(so something can successfully return undefined/null)?
I'm open to any of these options.


#### Examples

```js
````


#### Built-in Custom Matchers

All of the classes for primitive types
(Boolean, String, Number, BigInt)
expose a built-in Symbol.customMatcher static method,
matching if and only if the matchable is an object of that type,
or a primitive corresponding to that type
(using brand-checking to check objects,
so boxed values from other windows will still match).
The return value of a successful match
(for the purpose of [extractor patterns](#extractor-patterns))
is an iterator containing the (possibly auto-unboxed) primitive value.

All other platform objects also expose built-in Symbol.customMatcher methods,
matching if and only if the matchable is of the same type
(again using brand-checking to verify, similar to Array.isArray()).
The built-in matcher is treated as always returning `true` or `false`.
(We'll define this in the WebIDL spec.
WebIDL may grow a way to override the matcher for a class
and let it provide something more useful.)

Userland classes auto-define a default custom matcher
*if* a `Symbol.customMatcher` method is not present in the class definition.
This is just:

```js
[Symbol.customMatcher](subject) {
  return subject instanceof MyClass;
}
```

Note: The only prototype-based way to put a custom matcher on every class by default
would be to put it on `Function.prototype`.
That then blocks us from allowing boolean predicates as custom matchers,
as there is *no dependable way* to tell apart functions from constructors.
(You can't even rely on the existence of a constructor slot,
as many built-ins are defined to have one that just throws.)
This approach
(installing a custom matcher if it's not present in the class definition)
mirrors the behavior of constructor methods in class definitions,
and doesn't interfere with other functions.
However, if this is deemed unacceptable,
we could pursue other approaches,
like having a prefix keyword to indicate a "boolean predicate pattern"
so we can tell it apart from a custom matcher pattern.


### Regex Patterns

A regex pattern is a regex literal,
representing a test that the subject,
when stringified,
successfully matches the regex.

Regex patterns do not introduce bindings.

A regex pattern can be followed by a parenthesized pattern list,
identical to [custom matchers](#custom-matchers).
See that section for details on how this works.
Regex patterns can introduce bindings in this form,
identically to custom matchers.

#### Examples

```js
````


### Binding Patterns

A `let`, `const`, or `var` keyword followed by a valid variable name
(identical to binding statements anywhere else).
Binding statements don't represent a test at all
(they always succeed),
but they introduce a binding,
binding the subject to the given name
with the given variable semantics.

#### Examples

```js
````


### Void Patterns

The keyword `void` is a pattern
that always matches,
and does nothing else.
It's useful in structure patterns,
when you want to test for the existence of a property
without caring what its value is.

Void patterns never introduce bindings.

Issue: This pattern isn't approved by the full champions group,
but has been discussed.
Most pattern-matching languages have something for this;
without it, you have to use a binding pattern and just ignore the result,
or create a no-op always-succeeds custom matcher object.

#### Examples

```js
````


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

For example, `when ["foo", {bar}]` will match
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

Array patterns introduce all bindings introduced by their sub-patterns,
in order.

#### Examples

```js
````

#### Array Pattern Caching

To allow for idiomatic uses of generators
and other "single-shot" iterators
to be reasonably matched against several array patterns,
the iterators and their results are cached over the scope of the match construct.

Specifically, whenever a matchable is matched against an array pattern,
the matchable is used as the key in a cache,
whose value is the iterator obtained from the matchable,
and all items pulled from the matchable by an array pattern.

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

1. Has every specified property on its prototype chain.
2. If the key has an associated sub-pattern,
  then the value of that property matches the sub-pattern.

If the object pattern clause is `let/var/const <ident>`,
it's interpreted as equivalent to `<ident>: let/var/const ident`.

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

Object patterns introduce all bindings introduced by their sub-patterns,
in order.

Issue: Do we want a `key?: pattern` pattern clause as well?
Makes it an optional test -
*if* the subject has this property,
verify that it matches the pattern.
If the pattern is skipped because the property doesn't exist,
treat any bindings coming from the pattern
the same as ones coming from skipped `or` patterns.

#### Examples

```js
````

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

Whenever a matchable is matched against an object pattern,
for each property name in the object pattern,
a `(<matchable>, <property name>)` tuple is used as the key in a cache,
whose value is the value of the property.

Whenever something would be matched against an object pattern,
the cache is first checked,
and if the matchable and that property name are already in the cache,
the value is retrieved from cache instead of by a fresh Get against the matchable.

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
the custom matcher pattern is matched against the subject,
and if that succeeds,
the array pattern is matched against the custom matcher's return value.

For this purpose, a `true` return value
is treated as an empty iterator.
(It will match `foo()` or `foo(...)`,
but will fail `foo(a)`.)

Extractor patterns introduce the bindings from their "argument list",
identically to how array matchers work.

Issue: Extractor patterns are harder to use with existing functions,
since they have to return their result as an iterator,
which isn't as common as just returning the useful value immediately.
Maybe if the return value isn't `true`/`false`,
and not an iterable
(or maybe, more strictly, not an `Array`?),
then it's interpreted as the first item of an iterable?
That is, returning `2` would be the same as returning `[2]`.
This would also relieve some of the pressure on the plain variable-pattern custom matchers
possibly wanting to return non-bool values,
because you could deal with that in the extractor syntax instead,
possibly with a `...` to just ignore the result.


#### Examples

```js
class Option {
  constructor() { throw new TypeError(); }
}
Option.Some = class extends Option {
  constructor(value) { self.value = value; }
  map(cb) { return new Option.Some(cb(this.value)); }
  // etc
  static [Symbol.customMatcher](subject) {
    if(subject instanceof Option.Some) return [subject.value];
    return false;
  }
}
Option.None = class extends Option {
  constructor() { }
  map(cb) { return this; }
  // Use the default custom matcher,
  // which just checks that the subject matches the class.
}

let val = Option.Some(5);
match(val) {
  when Object.Some(String and let a): console.log(`Got a string "${a}".`);
  when Object.Some(Number and let a): console.log(`Got a number ${a}.`);
  when Object.Some(void): console.log(`Got something unexpected.`);
  // Or `Object.Some` or `Object.Some(...)`, either works.
  // `Object.Some()` will never match, as it always returns a value.
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

[Regex patterns](#regex-patterns) can similarly be written with an "argument list",
like an [extractor pattern](#extractor-patterns),
and are interpreted the same way.
For this purpose,
on a successful match
the "return value" (what's matched against the array pattern)
is an iterator whose items are the regex result object,
followed by each of the positive numbered groups in the regex result
(that is, skipping the "0" group that represents the entire match).

#### Examples

```js
match (arithmeticStr) {
  when /(?<left>\d+) \+ (?<right>\d+)/({groups:{let left, let right}}):
    // Using named capture groups
    processAddition(left, right);
  when /(\d+) \* (\d+)/(void, let left, let right):
    // Using positional capture groups
    processMultiplication(left, right);
  default: ...
}
````

Issue: Previously, named capture groups automatically established bindings.
Now that we have other ways to extract the groups (and other parts),
we've removed that to simplify the proposal.
Doing so means we don't have to decide what type of binding they establish,
which is nice,
but it is a little more verbose as you're repeating the capture group name.


## Combinator Patterns

Sometimes you need to match multiple patterns on a single value,
or pass a value that matches any of several patterns,
or just negate a pattern.
All of these can be achieved with combinator patterns.

### And Patterns

Two or more patterns, each separated by the keyword `and`.
This represents a test
that the subject passes *all* of the sub-patterns.

Short-circuiting applies; if any sub-pattern fails to match the subject,
matching stops immediately.

And patterns introduce all the bindings from their sub-patterns,
in order.

### Or Patterns

Two or more patterns, each separated by the keyword `or`.
This represents a test
that the subject passes *at least one* of the sub-patterns.

Short-circuiting applies; if any sub-pattern successfully matches the subject,
matching stops immediately.

Or patterns introduce all the bindings from the successful sub-pattern.
They also introduce all non-conflicting bindings
from their unsuccessful or skipped sub-patterns
(that is, any that don't have the same name as a binding from the successful pattern),
but bound to `undefined`.

### Not Patterns

A pattern preceded by the keyword `not`.
This represents a test that the subject *does not* match the sub-pattern.

Not patterns never introduce any bindings.



# Code samples

## General terminology

```jsx
match (res) {
  when ({ status: 200, body, ...rest }): handleData(body, rest)
  when ({ status, destination: url }) if (300 <= status && status < 400):
    handleRedirect(url)
  when ({ status: 500 }) if (!this.hasRetried): do {
    retry(req);
    this.hasRetried = true;
  }
  default: throwSomething();
}
```

### match expression

- The whole block beginning with the `match` keyword, is the
  [**match construct**](#match-construct).
- `res` is the [**matchable**](#matchable). This can be any expression.
- There are four [**clauses**](#clause) in this example: three `when` clauses,
  and one `default` clause.
- A [clause](#clause) consists of a left-hand side (LHS) and a right-hand side
  (RHS), separated by a colon (`:`).
- The LHS can begin with the `when` or `default` keywords.
  - The `when` keyword must be followed by a [**pattern**](#pattern) in
    parentheses. Each of the [`when` clauses](#clause) here contain
    [**object patterns**](#object-pattern).
  - The parenthesized pattern may be followed by a [**guard**](#guard), which
    consists of the `if` keyword, and a condition (any expression) in
    parentheses. [Guards](#guard) provide a space for additional logic when
    [patterns](#pattern) aren’t expressive enough.
  - An explicit `default` [clause](#clause) handles the "no match" scenario by
    always matching. It must always appear last when present, as any
    [clauses](#clause) after an `default` are unreachable.
- The RHS is any expression. It will be evaluated if the LHS successfully
  matches, and the result will be the value of the entire
  [match construct](#match-construct).

  - We assume that
    [`do` expressions](https://github.com/tc39/proposal-do-expressions) will
    mature soon, which will allow users to put multiple statements in an RHS; today,
    that requires an
    [IIFE](https://developer.mozilla.org/en-US/docs/Glossary/IIFE).

### is expression

```js
const problematic = res is { status: 500 };
if (problematic) logger.report(res);
```

- A new [RelationalExpression](https://tc39.es/ecma262/#prod-RelationalExpression) like `a instanceof b` and `a in b`, but for patterns.
- LHS is an expression, and RHS is a [**pattern**](#pattern).

## More on combinators

```jsx
match (command) {
  when ([ 'go', dir and ('north' or 'east' or 'south' or 'west')]): go(dir);
  when ([ 'take', item and /[a-z]+ ball/ and { weight }]): take(item);
  default: lookAround()
}
```

This sample is a contrived parser for a text-based adventure game.

The first clause matches if the command is an array with exactly two items. The
first must be exactly the string `'go'`, and the second must be one of the given
cardinal directions. Note the use of the
[**and combinator**](#pattern-combinators) to bind the second item in the
array to `dir` using an [**identifier pattern**](#identifier-pattern) before
verifying (using the [or combinator](#pattern-combinators)) that it’s one of the
given directions.

(Note that there is intentionally no precedence relationship between the pattern
operators, such as `and`, `or`, or `with`; parentheses must be used to group
[patterns](#pattern) using different operators at the same level.)

The second [clause](#clause) showcases a more complex use of the
[and combinator](#pattern-combinators). First is an
[identifier pattern](#identifier-pattern) that binds the second item in the
array to `item`. Then, there’s a [regex pattern](#regex-pattern) that checks if
the item is a `"something ball"`. Last is an [object pattern](#object-pattern),
which checks that the item has a `weight` property (which, combined with the
previous pattern, means that the item must be an exotic string object), and
makes that binding available to the RHS.

## Array length checking

```jsx
match (res) {
  if (isEmpty(res)): ...
  when ({ data: [page] }): ...
  when ({ data: [frontPage, ...pages] }): ...
  default: { ... }
}
```

[**Array patterns**](#array-pattern) implicitly check the length of the incoming
[matchable](#matchable).

The first [clause](#clause) is a bare [guard](#guard), which matches if the
condition is truthy.

The second [clause](#clause) is an [object pattern](#object-pattern) which
contains an [array pattern](#array-pattern), which matches if `data` has exactly
one element, and binds that element to `page` for the RHS.

The third [clause](#clause) matches if `data` has **at least one** element,
binding that first element to `frontPage`, and binding an array of any remaining
elements to `pages` using a [**rest pattern**](#rest-pattern).

([Rest patterns](#rest-pattern) can also be used in objects, with the expected
semantics.)



## Motivating examples

Below are selected situations where we expect pattern matching will be widely
used. As such, we want to optimize the ergonomics of such cases to the best of
our ability.

Matching `fetch()` responses:

```jsx
const res = await fetch(jsonService)
match (res) {
  when ({ status: 200, headers: { 'Content-Length': s } }):
    console.log(`size is ${s}`);
  when ({ status: 404 }):
    console.log('JSON not found');
  when ({ status }) if (status >= 400): do {
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
    when ({ type: 'set-visibility-filter', payload: visFilter }):
      { ...state, visFilter }
    when ({ type: 'add-todo', payload: text }):
      { ...state, todos: [...state.todos, { text, completed: false }] }
    when ({ type: 'toggle-todo', payload: index }): do {
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
    when ({ loading }): <Loading />
    when ({ error }): do {
      console.err("something bad happened");
      <Error error={error} />
    }
    when ({ data }): <Page data={data} />
  }}
</Fetch>
```

# Proposal

## Match construct

Refers to the entire `match (...) { ... }` expression. Evaluates to the RHS of
the first [clause](#clause) to match, or throws a TypeError if none match.

## Matchable

The value a [pattern](#pattern) is matched against. The top-level matchable
shows up in `match (matchable) { ... }`, and is used for each clause as the
initial matchable.

[Destructuring patterns](#array-pattern) can pull values out of a matchable,
using these sub-values as matchables for their own nested [patterns](#pattern).
For example, matching against `["foo"]` will confirm the matchable itself is an
array-like with one item, then treat the first item as a matchable against the
`"foo"` [primitive pattern](#primitive-pattern).

## Clause

One "arm" of the [match construct](#match-construct)’s contents, consisting of
an LHS (left-hand side) and an RHS (right-hand side), separated by a colon (`:`).

The LHS can look like:

- `when (<pattern>)`, which matches its [pattern](#pattern) against the
  top-level [matchable](#matchable);
- `if (<expr>)`, which matches if the `<expr>` is truthy;
- `when (<pattern>) if (<expr>)`, which does both;
- `default`, which always succeeds but must be the final clause.

The RHS is an arbitrary JS expression, which the whole
[match construct](#match-construct) resolves to if the LHS successfully matches.

(There is
[an open issue](https://github.com/tc39/proposal-pattern-matching/issues/181)
about whether there should be some separator syntax between the LHS and RHS.)

The LHS’s patterns, if any, can introduce variable bindings which are visible to
the guard and the RHS of the same clause. Bindings are not visible across
clauses. Each pattern describes what bindings, if any, it introduces.

### TODO: LHS

### TODO: RHS

## Guard

The `if (<expr>)` part of a clause. The `<expr>` sees bindings present at the
start of the [match construct](#match-construct); if the clause began with a
`when (<pattern>)`, it additionally sees the bindings introduced by the
[pattern](#pattern).

## Pattern

There are several types of patterns:

### Primitive Pattern

Boolean literals, numeric literals, string literals, and the null literal.

Additionally, some expressions that are _almost_ literals, and function as
literals in people’s heads, are allowed:

- `undefined`, matching the undefined value
- numeric literals preceded by an unary `+` or `-`, like `-1`
- `NaN`
- `Infinity` (with `+` or `-` prefixes as well)
- untagged template literals, with the interpolation expressions seeing only the
  bindings present at the start of the [match construct](#match-construct).

These match if the [matchable](#matchable) is
[`SameValue`](https://tc39.es/ecma262/#sec-samevalue) with them,
with one exception:
if the pattern is the literal `0` (without the unary prefix operators `+0` or `-0`),
it is instead compared with [`SameValueZero`](https://tc39.es/ecma262/#sec-samevaluezero).

(That is, `+0` and `-0` only match positive and negative zero, respectively,
while `0` matches both zeroes without regard for the sign.)

They do not introduce bindings.

### Identifier Pattern

Any identifier that isn’t a [primitive matcher](#primitive-matcher), such as
`foo`. These always match, and bind the [matchable](#matchable) to the given
binding name.

### Regex Pattern

A regular expression literal.

The [matchable](#matchable) is stringified, and the pattern matches if the
string matches the regex. If the regex defines named capture groups, those names
are introduced as bindings, bound to the captured substrings. Regex patterns can
use [`with`-chaining](#with-chaining) to further match a pattern against the
regex’s match result.

### Interpolation pattern

An arbitrary JS expression wrapped in `${}`, just like in template literals. For
example, `${myVariable}`, `${"foo-" + restOfString}`, or `${getValue()}`.

At runtime, the expression inside the `${}` is evaluated. If it resolves to an
object with a method named `Symbol.customMatcher`, that method is invoked, and
matching proceeds with the [custom matcher protocol](#custom-matcher-protocol)
semantics. If it resolves to anything else (typically a primitive, a `Symbol`,
or an object without a `Symbol.customMatcher` function), then the pattern matches if
the [matchable](#matchable) is
[`SameValue`](https://tc39.es/ecma262/#sec-samevalue) with the result.

Interpolation patterns can use [`with`-chaining](#with-chaining) to further
match against the `value` key of the object returned by the `Symbol.customMatcher`
method.

### Array Pattern

A comma-separated list of zero or more patterns or holes, wrapped in square
brackets, like `["foo", a, {bar}]`. "Holes" are just nothing (or whitespace),
like `[,,thirdItem]`.
The final item can optionally be either a "rest pattern",
looking like `...`,
or a "binding rest pattern",
looking like `...<identifier>`.
(Aka, an array pattern looks like array destructuring,
save for the addition of the "rest pattern" variant.)

First, an iterator is obtained from the [matchable](#matchable): if the
[matchable](#matchable) is itself iterable (exposes a `[Symbol.iterator]`
method) that is used; if it’s array-like, an array iterator is used.

Then, items are pulled from the iterator, and matched against the array
pattern’s corresponding nested patterns. (Holes always match, introducing no
bindings.) If any of these matches fail, the entire array pattern fails to
match.

If the array pattern ends in a binding rest pattern,
the remainder of the iterator is pulled into an Array,
and bound to the identifier from the binding rest pattern,
just like in array destructuring.

If the array pattern does _not_ end in a rest pattern (binding or otherwise),
the iterator must match the array pattern’s length:
one final item is pulled from the iterator,
and if it succeeds (rather than closing the iterator),
the array pattern fails to match.

The array pattern introduces all the bindings introduced by its nested patterns,
plus the binding introduced by its binding rest pattern, if present.

Bindings introduced by earlier nested patterns
are visible to later nested patterns in the same array pattern.
(For example, `[a, ${a}]`) will match
only if the second item in the array is identical to the first item.)

#### Array Pattern Caching

To allow for idiomatic uses of generators and other "single-shot" iterators to
be reasonably matched against several array patterns, the iterators and their
results are cached over the scope of the [match construct](#match-construct).

Specifically, whenever a [matchable](#matchable) is matched against an array
pattern, the [matchable](#matchable) is used as the key in a cache, whose value
is the iterator obtained from the [matchable](#matchable), and all items pulled
from the [matchable](#matchable) by an array pattern.

Whenever something would be matched against an array pattern, the cache is first
checked, and the already-pulled items stored in the cache are used for the
pattern, with new items pulled from the iterator only if necessary.

For example:

```js
function* integers(to) {
  for(var i = 1; i <= to; i++) yield i;
}

const fiveIntegers = integers(5);
match (fiveIntegers) {
  when([a]):
    console.log(`found one int: ${a}`);
    // Matching a generator against an array pattern.
    // Obtain the iterator (which is just the generator itself),
    // then pull two items:
    // one to match against the `a` pattern (which succeeds),
    // the second to verify the iterator only has one item
    // (which fails).
  when([a, b]):
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

When execution of the match construct finishes,
all cached iterators are closed.


### Object Pattern

A comma-separated list of zero or more "object pattern clauses", wrapped in
curly braces, like `{x: "foo", y, z: {bar}}`. Each "object pattern clause" is
either an `<identifier>`, or a `<key>: <pattern>` pair, where `<key>` is an
`<identifier>` or a computed-key expression like `[Symbol.foo]`. The final item
can be a "rest pattern", looking like `...<identifier>`. (Aka, it looks like
object destructuring.)

For each object pattern clause, the [matchable](#matchable) must contain a
property matching the key, and the value of that property must match the
corresponding pattern; if either of these fail for any object pattern clause,
the entire object pattern fails to match.

Plain `<identifier>` object pattern clauses are treated as if they were written
`<identifier>: <identifier>` (just like destructuring); that is, the
[matchable](#matchable) must have the named property, and the property’s value
is then bound to that name due to being matched against an
[identifier pattern](#identifier-pattern).

If the object pattern ends in a [TODO: rest pattern], all of the
[matchable](#matchable)’s own keys that weren’t explicitly matched are bound
into a fresh `Object`, just like destructuring or array patterns.

Unlike array patterns, the lack of a final rest pattern imposes no additional
constraints; `{foo}` will match the object `{foo: 1, bar:2}`, binding `foo` to
`1` and ignoring the other key.

The object pattern introduces all the bindings introduced by its nested
patterns, plus the binding introduced by its rest pattern, if present.

Bindings introduced by earlier nested patterns
are visible to later nested patterns in the same object pattern.
(For example, `{a, b:${a}}`) will match
only if the `b` property item in the object is identical to the `a` property's value.)
Ordering is important, however, so `{b:${a}, a}` does *not* mean the same thing;
instead, the `${a}` resolves based on whatever `a` binding might exist from earlier in the pattern,
or outside the match construct entirely.

#### Object Pattern Caching

Similar to [array pattern caching](#array-pattern-caching), object patterns
cache their results over the scope of the [match construct](#match-construct),
so that multiple [clauses](#clause) don’t observably retrieve the same property
multiple times.

(Unlike array pattern caching, which is _necessary_ for this proposal to work
with iterators, object pattern caching is a nice-to-have. It does guard against
some weirdness like non-idempotent getters, and helps make
idempotent-but-expensive getters usable in pattern matching without contortions,
but mostly it’s just for conceptual consistency.)

Whenever a [matchable](#matchable) is matched against an object pattern, for
each property name in the object pattern, a `(<matchable>, <property name>)`
tuple is used as the key in a cache, whose value is the value of the property.

Whenever something would be matched against an object pattern, the cache is
first checked, and if the [matchable](#matchable) and that property name are
already in the cache, the value is retrieved from cache instead of by a fresh
`Get` against the [matchable](#matchable).

For example:

```js
const randomItem = {
  get numOrString() { return Math.random() < .5 ? 1 : "1"; }
};

match (randomItem) {
  when({numOrString: ${Number}}):
    console.log("Only matches half the time.");
    // Whether the pattern matches or not,
    // we cache the (randomItem, "numOrString") pair
    // with the result.
  when({numOrString: ${String}}):
    console.log("Guaranteed to match the other half of the time.");
    // Since (randomItem, "numOrString") has already been cached,
    // we reuse the result here;
    // if it was a string for the first clause,
    // it’s the same string here.
}
```

### TODO: Rest pattern

## Custom Matcher Protocol

When the expression inside an [interpolation pattern](#interpolation-pattern)
evaluates to an object with a `Symbol.customMatcher` method, that method is called
with the [matchable](#matchable) as its sole argument.

To implement the `Symbol.customMatcher` method, the developer must return an object
with a `matched` property. If that property is truthy, the pattern matches; if
that value is falsy, the pattern does not match. In the case of a successful
match, the matched value must be made available on a `value` property of the
return object.

### Built-in Custom Matchers

All of the classes for primitive types (`Boolean`, `String`, `Number`, `BigInt`)
expose a built-in `Symbol.customMatcher` method, matching if and only if the
[matchable](#matchable) is an object of that type, or a primitive corresponding
to that type (using brand-checking to check objects, so boxed values from other
windows will still match). The `value` property of the returned object is the
(possibly auto-unboxed) primitive value.

All other platform objects also expose built-in `Symbol.customMatcher` methods,
matching if and only if the [matchable](#matchable) is of the same type (again
using brand-checking to verify, similar to `Array.isArray()`). The `value`
property of the returned object is the [matchable](#matchable) itself.

Userland classes do _not_ define a default custom matcher (for both
[practical and technical reasons](https://github.com/tc39/proposal-pattern-matching/issues/231)), but it is very simple to define one in
this style:

```jsx
class Foo {
  static [Symbol.customMatcher](value) {
    return {
      matched: value instanceof Foo,
      value,
    };
  }
}
```

### `with` chaining

An [interpolation pattern](#interpolation-pattern) or a
[regex pattern](#regex-pattern) (referred to as the "parent pattern" for the
rest of this section) _may_ also have a `with <pattern>` suffix, allowing you to
provide further patterns to match against the parent pattern’s result.

The `with` pattern is only invoked if the parent pattern successfully matches.
Any bindings introduced by the `with` pattern are added to the bindings from the
parent pattern, with the `with` pattern’s values overriding the parent pattern’s
value if the same bindings appear in both.

The parent pattern defines what the [matchable](#matchable) will be for the
`with` pattern:

- for regex patterns, the regex’s match object is used
- for interpolation patterns that did not invoke the custom matcher protocol,
  the [matchable](#matchable) itself is used
- for interpolation patterns that _did_ invoke the custom matcher protocol, the
  value of the `value` property on the result object is used

For example:

```jsx
class MyClass = {
  static [Symbol.customMatcher](matchable) {
    return {
      matched: matchable === 3,
      value: { a: 1, b: { c: 2 } },
    };
  }
};

match (3) {
  when (${MyClass}): true; // matches, doesn’t use the result
  when (${MyClass} with {a, b: {c}}): do {
    // passes the custom matcher,
    // then further applies an object pattern to the result’s value
    assert(a === 1);
    assert(c === 2);
  }
}
```

or

```jsx
match ("foobar") {
  when (/foo(.*)/ with [, suffix]):
    console.log(suffix);
    // logs "bar", since the match result
    // is an array-like containing the whole match
    // followed by the groups.
    // note the hole at the start of the array matcher
    // ignoring the first item,
    // which is the entire match "foobar".
}
```

## Pattern combinators

Two or more [patterns](#pattern) can be combined with `or` or `and` to form a
single larger pattern.

A sequence of `or`-separated [patterns](#pattern) have short-circuiting "or"
semantics: the **or [pattern](#pattern)** matches if any of the nested
[patterns](#pattern) match, and stops executing as soon as one of its nested
[patterns](#pattern) matches. It introduces all the bindings introduced by its
nested [patterns](#pattern), but only the _values_ from its first successfully
matched [pattern](#pattern); bindings introduced by other [patterns](#pattern)
(either failed matches, or [patterns](#pattern) past the first successful match)
are bound to `undefined`.

A sequence of `and`-separated [patterns](#pattern) have short-circuiting "and"
semantics: the **and [pattern](#pattern)** matches if all of the nested
[patterns](#pattern) match, and stops executing as soon as one of its nested
[patterns](#pattern) fails to match. It introduces all the bindings introduced
by its nested [patterns](#pattern), with later [patterns](#pattern) providing
the value for a given binding if multiple [patterns](#pattern) would introduce
that binding.

Note that `and` can idiomatically be used to bind a [matchable](#matchable) and
still allow it to be further matched against additional [patterns](#pattern).
For examle, `when (foo and [bar, baz]) ...` matches the [matchable](#matchable)
against both the `foo` [identifier pattern](#identifier-pattern) (binding it to
`foo` for the RHS) _and_ against the `[bar, baz]`
[array pattern](#array-pattern).

Bindings introduced by earlier nested patterns
are visible to later nested patterns in the same combined pattern.
(For example, `(a and ${console.log(a)||a})`) will bind the matchable to `a`,
and then log it.)

(Note: the `and` and `or` spellings of these operators are preferred by the champions group,
but we'd be okay with spelling them `&` and `|` if the committee prefers.

## Parenthesizing Patterns

The pattern syntaxes do not have a precedence relationship with each other. Any
multi-token patterns (`and`, `or`, `${...} with ...`) appearing at the same
"nesting level" are a syntax error; parentheses must be used to to specify their
relationship to each other instead.

For example, `when ("foo" or "bar" and val) ...` is a syntax error; it must be
written as `when ("foo" or ("bar" and val)) ...` or `when (("foo" or "bar") and val)`
instead. Similarly, `when (${Foo} with bar and baz) ...` is a syntax error; it
must be written as `when (${Foo} with (bar and baz)) ...` (binding the custom
match result to both `bar` and `baz`) or `when ((${Foo} with bar) and baz) ...`
(binding the custom match result to `bar`, and the _original_
[matchable](#matchable) to `baz`).

## is expression

Refers to the `expr is pattern` expression. Evaluates to a boolean to indicate if the LHS matches the RHS.

# Possible future enhancements

## `async match`

If the `match` construct appears inside a context where `await` is allowed,
`await` can already be used inside it, just like inside `do` expressions.
However, just like `async do` expressions, there’s uses of being able to use
`await` and produce a Promise, even when not already inside an `async function`.

```jsx
async match (await matchable) {
  when ({ a }): await a;
  when ({ b }): b.then(() => 42);
  default: await somethingThatRejects();
} // produces a Promise
```

## Nil pattern

```jsx
match (someArr) {
  when ([_, _, someVal]): ...
}
```

Most languages that have structural pattern matching have the concept of a "nil
matcher", which fills a hole in a data structure without creating a binding.

In JS, the primary use-case would be skipping spaces in arrays. This is already
covered in destructuring by simply omitting an identifier of any kind in between
the commas.

With that in mind, and also with the extremely contentious nature, we would only
pursue this if we saw strong support for it.

## Default Values

Destructuring can supply a default value with `= <expr>` which is used when a
key isn’t present. Is this useful for pattern matching?

Optional keys seem reasonable; right now they’d require duplicating the pattern
like `({a, b} or {a})` (`b` will be bound to undefined in the RHS if not present).

Do we need/want full defaulting? Does it complicate the syntax to much to have
arbitrary JS expressions there, without anything like wrapper characters to
distinguish it from surrounding patterns?

This would bring us into closer alignment with destructuring, which is nice.

## Dedicated renaming syntax

Right now, to bind a value in the middle of a pattern but continue to match on
it, you use `and` to run both an [identifier pattern](#identifier-pattern) and a
further [pattern](#pattern) on the same value, like `when(arr and [item]): ...`.

Langs like Haskell and Rust have a dedicated syntax for this, spelled `@`; if we
adopted this, the above could be written as `when(arr @ [item]): ...`.

Since this would introduce no new functionality, just a dedicated syntactic form
for a common operation and some amount of concordance with other languages,
we’re not pursuing this as part of the base proposal.

## Destructuring enhancements

Both destructuring and pattern matching should remain in sync, so enhancements
to one would need to work for the other.

## Integration with `catch`

Allow a `catch` statement to conditionally catch an exception, saving a level of
indentation:

```jsx
try {
  throw new TypeError('a');
} catch match (e) {
  if (e instanceof RangeError): ...
  when (/^abc$/): ...
  default: do { throw e; } // default behavior
}
```

## Chaining guards

Some reasonable use-cases require repetition of patterns today, like:

```js
match (res) {
  when ({ pages, data }) if (pages > 1): console.log("multiple pages")
  when ({ pages, data }) if (pages === 1): console.log("one page")
  default: console.log("no pages")
}
```

We might want to allow match constructs to be chained, where the child match
construct sees the bindings introduced in their parent clause, and which will
cause the entire parent clause to fail if none of the sub-classes match.

The above would then be written as:

```js
match (res) {
  when ({ pages, data }) match {
    if (pages > 1): console.log("multiple pages")
    if (pages === 1): console.log("one page")
    // if pages == 0, no clauses succeed in the child match,
    // so the parent clause fails as well,
    // and we advance to the outer `default`
  }
  default: console.log("no pages")
}
```

Note the lack of [matchable](#matchable) in the child (just `match {...}`), to
signify that it’s chaining from the `when` rather than just being part an
independent match construct in the RHS (which would, instead, throw if none of
the clauses match):

```js
match (res) {
  when ({ pages, data }): match (0) {
    if(pages > 1): console.log("multiple pages")
    if(pages === 1): console.log("one page")
    // just an RHS, so if pages == 0,
    // the inner construct fails to match anything
    // and throws a TypeError
  }
  default: console.log("no pages")
}
```

The presence or absence of the separator colon also distinguishes these cases,
of course.

## `or` on when clauses

There might be some cases that requires different `when + if` guards with the same RHS.

```js
// current
match (expr()) {
    when ({ type: 'a', version, ...rest }) if (isAcceptableTypeVersion(version)):
        a_long_expression_do_something_with_rest
    when ({ kind: 'a', version, ...rest }) if (isAcceptableKindVersion(version)):
        a_long_expression_do_something_with_rest
}
```

Today this case can be resolved by extracting `a_long_expression_do_something_with_rest` to a function,
but if cases above are very common, we may also allows `or` to be used on the when clause,
and the code above becomes:

```js
// current
match (expr()) {
    when ({ type: 'a', version, ...rest }) if (isAcceptableTypeVersion(version))
    or when ({ kind: 'a', version, ...rest }) if (isAcceptableKindVersion(version)):
        a_long_expression_do_something_with_rest
}
```

<!--
## Implementations

* [Babel Plugin](https://github.com/babel/babel/pull/9318)
* [Sweet.js macro](https://github.com/natefaubion/sparkler) (NOTE: this isn’t based on the proposal, this proposal is partially based on it!)
-->
