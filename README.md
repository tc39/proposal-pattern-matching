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

There are many ways to match values in the language, but there are no ways to
match patterns beyond regular expressions for strings. `switch` is severely
limited: it may not appear in expression position; an explicit `break` is
required in each `case` to avoid accidental fallthrough; scoping is ambiguous
(block-scoped variables inside one `case` are available in the scope of the
others, unless curly braces are used); the only comparison it can do is `===`;
etc.

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

## Bindings from regex patterns with named capture groups

```jsx
match (arithmeticStr) {
  when (/(?<left>\d+) \+ (?<right>\d+)/): process(left, right);
  when (/(\d+) \* (\d+)/ with [, left, right]): process(left, right);
  default: ...
}
```

This sample is a contrived arithmetic expression parser which uses
[regex patterns](#regex-patterns).

The first clause matches integer addition expressions, using named capture
groups for each of the operands. The RHS is able to see the named capture groups
as bindings.

(These magic bindings will only work with **literal**
[regex patterns](#regex-patterns). If a regex with named capture groups is
passed into an [interpolation pattern](#interpolation-pattern), the RHS will see
no magic bindings. It’s very important (e.g. for code analysis tools) that
bindings only be introduced where the name is locally present.)

The second clause matches integer multiplication expressions, but without named
capture groups. Regexes (both literals and references inside
[interpolation patterns](#interpolation-patterns)) implement the
[custom matcher protocol](#custom-matcher-protocol), which makes the return
value of
[`String.prototype.match`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/match)
available to the [`with` operator](#with-chaining).

(Regexes are a major motivator for the
[custom matcher protocol](#custom-matcher-protocol) ― while we could treat them
as a special case, they’re just ordinary objects. If they can be used as a
[pattern](#regex-pattern), then userland objects should be able to do this as
well.)

## Speaking of interpolations...

```jsx
const LF = 0x0a;
const CR = 0x0d;

match (nextChar()) {
  when (${LF}): ...
  when (${CR}): ...
  default: ...
}
```

Here we see the [**interpolation operator**](#interpolation-pattern) (`${}`),
which escapes from "pattern mode" syntax to "expression mode" syntax. It is
conceptually very similar to using `${}` in template strings.

Written as just `LF`, `LF` is an [identifier pattern](#identifier-pattern),
which would always match regardless of the value of the [matchable](#matchable)
(`nextChar()`) and bind it to the given name (`LF`), shadowing the outer
`const LF = 0x0a` declaration at the top.

Written as `${LF}`, `LF` is evaluated as an expression, which results in the
primitive `Number` value `0x0a`. This value is then treated as a
[literal Number pattern](#primitive-pattern), and the [clause](#clause) matches
if the [matchable](#matchable) is `0x0a`. The RHS sees no new bindings.

## [Custom matcher protocol](#custom-matcher-protocol) interpolations

```jsx
class Option {
  #value;
  #hasValue = false;

  constructor (hasValue, value) {
    this.#hasValue = !!hasValue;
    if (hasValue) {
      this.#value = value;
    }
  }

  get value() {
    if (this.#hasValue) return this.#value;
    throw new Exception('Can’t get the value of an Option.None.');
  }

  static Some(val) {
    return new Option(true, val);
  }

  static None() {
    return new Option(false);
  }

  static {
    Option.Some[Symbol.matcher] = (val) => ({
      matched: #hasValue in val && val.#hasValue,
      value: #value in val && val.#value,
    });

    Option.None[Symbol.matcher] = (val) => ({
      matched: #hasValue in val && !val.#hasValue
    });
  }
}

match (result) {
  when (${Option.Some} with val): console.log(val);
  when (${Option.None}): console.log("none");
}
```

In this sample implementation of the common "Option" type,
the expressions inside `${}` are the static "constructors" `Option.Some` and `Option.None`,
which have a `Symbol.matcher` method. That method is invoked with the
[matchable](#matchable) (`result`) as its sole argument. The
[interpolation pattern](#interpolation-pattern) is considered to have matched if
the `Symbol.matcher` method returns an object with a truthy `matched` property.
Any other return value (including `true` by itself) indicates a failed match. (A
thrown error percolates up the expression tree, as usual.)

The [interpolation pattern](#interpolation-pattern) can optionally chain into
another pattern using [`with` chaining](#with-chaining), which matches against
the `value` property of the object returned by the `Symbol.matcher` method;
in this case, it allows `Option.Some` to expose the value inside of the `Option`.

Dynamic custom matchers can readily be created, opening a world of
possibilities:

```jsx
function asciiCI(str) {
  return {
    [Symbol.matcher](matchable) {
      return {
        matched: str.toLowerCase() == matchable.toLowerCase()
      };
    }
  }
}

match (cssProperty) {
  when ({ name: name and ${asciiCI("color")}, value }):
    console.log("color: " + value);
    // matches if `name` is an ASCII case-insensitive match
    // for "color", so `{name:"COLOR", value:"red"} would match.
}
```

## Built-in custom matchers

```jsx
match (value) {
  when (${Number}): ...
  when (${BigInt}): ...
  when (${String}): ...
  when (${Array}): ...
  default: ...
}
```

All the built-in classes come with a predefined `Symbol.matcher` method which
uses
[brand check semantics](https://github.com/tc39/how-we-work/blob/master/terminology.md#brand-check)
to determine if the incoming [matchable](#matchable) is of that type. If so, the
[matchable](#matchable) is returned under the `value` key.

Brand checks allow for predictable results across realms. So, for example,
arrays from other windows will still successfully match the `${Array}` pattern,
similar to `Array.isArray()`.

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
object with a method named `Symbol.matcher`, that method is invoked, and
matching proceeds with the [custom matcher protocol](#custom-matcher-protocol)
semantics. If it resolves to anything else (typically a primitive, a `Symbol`,
or an object without a `Symbol.matcher` function), then the pattern matches if
the [matchable](#matchable) is
[`SameValue`](https://tc39.es/ecma262/#sec-samevalue) with the result.

Interpolation patterns can use [`with`-chaining](#with-chaining) to further
match against the `value` key of the object returned by the `Symbol.matcher`
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
evaluates to an object with a `Symbol.matcher` method, that method is called
with the [matchable](#matchable) as its sole argument.

To implement the `Symbol.matcher` method, the developer must return an object
with a `matched` property. If that property is truthy, the pattern matches; if
that value is falsy, the pattern does not match. In the case of a successful
match, the matched value must be made available on a `value` property of the
return object.

### Built-in Custom Matchers

All of the classes for primitive types (`Boolean`, `String`, `Number`, `BigInt`)
expose a built-in `Symbol.matcher` method, matching if and only if the
[matchable](#matchable) is an object of that type, or a primitive corresponding
to that type (using brand-checking to check objects, so boxed values from other
windows will still match). The `value` property of the returned object is the
(possibly auto-unboxed) primitive value.

All other platform objects also expose built-in `Symbol.matcher` methods,
matching if and only if the [matchable](#matchable) is of the same type (again
using brand-checking to verify, similar to `Array.isArray()`). The `value`
property of the returned object is the [matchable](#matchable) itself.

Userland classes do _not_ define a default custom matcher (for both
[practical and technical reasons](https://github.com/tc39/proposal-pattern-matching/issues/231)), but it is very simple to define one in
this style:

```jsx
class Foo {
  static [Symbol.matcher](value) {
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
  static [Symbol.matcher](matchable) {
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
