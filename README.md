# ECMAScript Pattern Matching

## [Status](https://tc39.github.io/process-document/)

**Stage**: 1

**Authors**: Originally Kat Marchán (Microsoft, [@zkat__](https://twitter.com/zkat__)); now, the below champions.

**Champions**:
(in alphabetical order)
* Daniel Rosenwasser (Microsoft, [@drosenwasser](https://twitter.com/drosenwasser))
* Jack Works (Sujitech, [@Jack-Works](https://github.com/Jack-Works))
* Jordan Harband (Coinbase, [@ljharb](https://twitter.com/ljharb))
* Mark Cohen ([@mpcsh_](https://twitter.com/mpcsh_))
* Ross Kirsling (Sony, [@rkirsling](https://twitter.com/rkirsling))
* Tab Atkins-Bittner (Google, [@tabatkins](https://twitter.com/tabatkins))
* Yulia Startsev (Mozilla, [@ioctaptceb](https://twitter.com/ioctaptceb))

## Table of Contents

* [Problem](#problem)
* [Priorities](#priorities-for-a-solution)
* [Prior Art](#priorities-for-a-solution)
* [<s>P</s>Code Samples](#code-samples)
* [Motivating Examples](#motivating-examples)
* [Terminology/Proposal](#proposal)
* [Possible Future Enhancements](#possible-future-enhancements)


## Problem

There are many ways to match values in the language, but there are no ways to match patterns beyond regular expressions for strings. `switch` is severely limited: it may not appear in expression position; an explicit `break` is required in each `case` to avoid accidental fallthrough; scoping is ambiguous (block-scoped variables inside one `case` are available in the scope of the others, unless curly braces are used); the only comparison it can do is `===`; etc.

## Priorities for a solution

This section details this proposal’s priorities. Note that not every champion may agree with each priority.

### _Pattern_ matching

The pattern matching construct is a full conditional logic construct that can do more than just pattern matching. As such, there have been (and there will be more) trade-offs that need to be made. In those cases, we should prioritize the ergonomics of structural pattern matching over other capabilities of this construct.

### Subsumption of `switch`

This feature must be easily searchable, so that tutorials and documentation are easy to locate, and so that the feature is easy to learn and recognize. As such, there must be no syntactic overlap with the `switch` statement.

This proposal seeks to preserve the good parts of `switch`, and eliminate any reasons to reach for it.

### Be better than `switch`

`switch` contains a plethora of footguns such as accidental case fallthrough and ambiguous scoping. This proposal should eliminate those footguns, while also introducing new capabilities that `switch` currently can not provide.

### Expression semantics

The pattern matching construct should be usable as an expression:
 - `return match { … }`
 - `let foo = match { … }`
 - `() => match { … }`
 - etc.

 The value of the whole expression is the value of whatever [clause](#clause) is matched.

### Exhaustiveness and ordering

If the developer wants to ignore certain possible cases, they should specify that explicitly. A development-time error is less costly than a production-time error from something further down the stack.

If the developer wants two cases to share logic (what we know as “fall-through” from `switch`), they should specify it explicitly. Implicit fall-through inevitably silently accepts buggy code.

[Clauses](#clause) should always be checked in the order they’re written, i.e. from top to bottom.

### User extensibility

Userland objects should be able to encapsulate their own matching semantics, without unnecessarily privileging builtins. This includes regular expressions (as opposed to the literal pattern syntax), numeric ranges, etc.

## Prior Art

This proposal adds a pattern matching expression to the language, based in part on the existing [Destructuring Binding Patterns](https://tc39.github.io/ecma262/#sec-destructuring-binding-patterns).

This proposal was approved for Stage 1 in the May 2018 TC39 meeting, and [slides for that presentation are available](https://docs.google.com/presentation/d/1WPyAO4pHRsfwGoiIZupz_-tzAdv8mirw-aZfbxbAVcQ/edit?usp=sharing). Its current form was presented to TC39 in the April 2021 meeting ([slides](https://hackmd.io/@mpcsh/HkZ712ig_#/)).

This proposal draws from, and partially overlaps with, corresponding features in
[Rust](https://doc.rust-lang.org/1.6.0/book/patterns.html),
[Python](https://www.python.org/dev/peps/pep-0622/),
[F#](https://docs.microsoft.com/en-us/dotnet/fsharp/language-reference/pattern-matching),
[Scala](http://www.scala-lang.org/files/archive/spec/2.11/08-pattern-matching.html),
[Elixir/Erlang](https://elixir-lang.org/getting-started/pattern-matching.html), and
[C++](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2020/p1371r2.pdf).

### Userland matching

A list of community libraries that provide similar matching functionality:

- [Optionals](https://github.com/OliverBrotchie/optionals) — Rust-like error handling, options and exhaustive pattern matching for TypeScript and Deno
- [ts-pattern](https://github.com/gvergnaud/ts-pattern) — Exhaustive Pattern Matching library for TypeScript, with smart type inference.
- [babel-plugin-proposal-pattern-matching](https://github.com/iptop/babel-plugin-proposal-pattern-matching) — Minimal grammar, high performance JavaScript pattern matching implementation.
## Code samples

```jsx
    match (res) {
//  match (matchable) {
      when ({ status: 200, body, ...rest })
//    when (pattern)  …
//    ───────↓────── ─↓─
//          LHS      RHS (expression)
//    ───────────↓──────
//            clause
        handleData(body, rest);

      when ({ status: 301 | 304, destination: url })
//      ↳ `|` (pipe) is the “or” combinator
//      ↳ `url` is an irrefutable match, effectively a new name for `destination`
        handleRedirect(url);

      when({ status: 404 }) retry(req);

      else throwSomething();
//    ↳ cannot coexist with top-level irrefutable match, e.g. `when (foo)`
    }
```
 - `res` is the “matchable”. This can be any expression.
 - `when (…) { … }` is the “[clause](#clause)”.
 - the `…` in `when (…)` is the “pattern”.
 - Everything after the pattern is the “right-hand side” (RHS), and is an expression that will be evaluated if the pattern matches

    (We assume that [`do` expressions](https://github.com/tc39/proposal-do-expressions) will mature soon,
    to allow for RHSes with statements in them easily;
    today they require an IIFE).
 - `301 | 304` uses `|` to indicate “or” semantics for multiple patterns
 - Most valid object or array destructurings are valid patterns.
    (Default values aren't supported yet.)
 - An explicit `else` [clause](#clause) handles the “no match” scenario by always matching. It must always appear last when present, as any [clauses](#clause) after an `else` are unreachable.

---

```jsx
match (command) {
  when ([ 'go', dir & ('north' | 'east' | 'south' | 'west')]) …
  when ([ 'take', item ]) …
  else …
}
```
This sample is a contrived parser for a text-based adventure game.
Note the use of `&`, to indicate "and" semantics,
here being used to bind the second array item to `dir` with an ident pattern
*and* verify that it's one of the supported values.
The second [clause](#clause) doesn't need to verify its argument
(at least, not here in the matcher clause),
so it just uses an ident pattern to bind the value to `item`.

(Note that there is intentionally no precedence relationship
between the pattern operators, such as `&`, `|`, or `with`;
parentheses must be used to group patterns
using different operators at the same level.)

---

```jsx
match (res) {
  if (isEmpty(res)) { … }
  when ({ numPages, data }) if (numPages > 1) …
  when ({ numPages, data }) if (numPages === 1) …
  else { … }
}
```
This sample is fetching from a paginated endpoint. Note the use of **guards** (the `if` statements), which provide additional conditional logic where patterns aren’t expressive enough.

---

```jsx
match (res) {
  if (isEmpty(res)) …
  when ({ data: [page] }) …
  when ({ data: [frontPage, ...pages] }) …
  else { … }
}
```
This is another way to write the previous code sample without a guard, and without checking the page count.

The first `when` clause matches if `data` has exactly one element, and binds that element to `page` for the right-hand side. The second `when` clause matches if `data` has at least one element, binding that first element to `frontPage`, and an array of any remaining elements to `pages`.

Note that for this to work properly, iterator results will need to be cached until there’s a successful match, for example to allow checking the first item more than once.

---

```jsx
match (arithmeticStr) {
  when (/(?<left>\d+) \+ (?<right>\d+)/) process(left, right);
  when (/(\d+) \+ (\d+)/) with ([_, left, right])
    process(left, right);
  else …
}
```
This sample is a contrived arithmetic expression parser. Regexes are patterns, with the expected matching semantics. Named capture groups automatically introduce bindings for the RHS.

Additionally, regexes follow the [user-extensible protocol](#user-extensibility),
returning their match object for further pattern-matching using the `with (pattern)` suffix.
In this example, since a match object is an array-like,
it can be further matched with an array matcher
to extract the capture groups instead.

(Regexes are a major motivator for the [user-extensible protocol](#user-extensibility) ―
while they are technically a built-in, with their own syntax,
they're ordinary objects in every other way.
If they can be used as a pattern,
and introduce their own chosen bindings,
then userland objects should be able to do this as well.)

---

```jsx
const LF = 0x0a;
const CR = 0x0d;
match (nextChar()) {
  when (${LF}) …
  when (${CR}) …
  else …
}
```
Here we see the **pattern-interpolation operator** (`${}`),
which allows arbitrary values to be matched,
rather than just literals.
It is similar to using `${}` in template strings,
letting you "escape" a specialized syntax
and evaluate an arbitrary JS expression,
then convert it appropriately into the outer context
(a pattern).

Without `${}`, `when (LF)` would be an **ident matcher**, which would always match regardless of the value of the matchable (`nextChar()`) and bind the matched value to the given name (`LF`), shadowing the outer `const LF = 0x0a` binding at the top.

With `${LF}`, `LF` is evaluated as an expression, which results in the primitive Number value `0x0a`. This is then treated like a literal Number matcher, and the clause matches only if the matchable is `0x0a`. The right-hand side sees no new bindings.

---

```jsx
class Name {
  static [Symbol.matcher](matchable) {
    const pieces = matchable.split(' ');
    if (pieces.length === 2) {
      return {
        matched: true,
        value: pieces
      };
    }
  }
}

match ('Tab Atkins-Bittner') {
  when (${Name} with [first, last]) if (last.includes('-')) …
  when (${Name} with [first, last]) …
  else …
}
```

While the previous example showed off `${}` evaluating to a primitive,
the expression can also evaluate to a user-defined object,
invoking the [user-extensible matcher protocol](#user-extensibility)
on the object.

When the expression (`Name`, here) evaluates to a non-primitive object,
it's first checked for a `Symbol.matcher` method;
if it has one, the method is invoked with the matchable,
and needs to return a match result object,
similar to the iterator protocol.

The `matched` key of the match result determines whether the pattern is considered to have matched or not. If `true`, then the `value` key of the match result can be further pattern-matched using the `with (pattern)` suffix.

If the object doesn't have a `Symbol.matcher` method,
then it's just compared with the matchable using `===` semantics.

---

```js
match(value) {
  when (${Number}) ...
  when (${BigNum}) ...
  when (${String}) ...
  when (${Array}) ...
  else ...
}
```

All the built-in classes
come with a predefined `[Symbol.matcher]` method
which matches if the value is of that type,
using brand-checking semantics
(so, for example, Arrays from other windows
will still successfully match,
similar to `Array.isArray()`),
and returning the matchable as their match value.


## Motivating Examples

Matching `fetch()` responses:
```jsx
const res = await fetch(jsonService)
match (res) {
  when ({ status: 200, headers: { 'Content-Length': s } })
    console.log(`size is ${s}`);
  when ({ status: 404 })
    console.log('JSON not found');
  when ({ status }) if (status >= 400) do {
    throw new RequestError(res);
  }
};
```

---

More concise, more functional handling of Redux reducers. Compare with [this same example in the Redux documentation](https://redux.js.org/basics/reducers#splitting-reducers):
```jsx
function todoApp(state = initialState, action) {
  return match (action) {
    when ({ type: 'set-visibility-filter', payload: visFilter })
      { ...state, visFilter }
    when ({ type: 'add-todo', payload: text })
      { ...state, todos: [...state.todos, { text, completed: false }] }
    when ({ type: 'toggle-todo', payload: index }) do {
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
    else state // ignore unknown actions
  }
}
```

---

Concise props handling inlined with JSX (via [Divjot Singh](https://twitter.com/bogas04/status/977499729557839873)):
```jsx
<Fetch url={API_URL}>
  {props => match (props) {
    when ({ loading }) <Loading />
    when ({ error }) <Error error={error} />
    when ({ data }) <Page data={data} />
  }}
</Fetch>
```



## Proposal

Terms we use when discussing this proposal:

### Match construct
Refers to the entire `match (…) { … }` expression.

### Matchable
The value a pattern is matched against.
The initial matchable shows up in `match (matchable) { … }`,
and is used for each match clause as the initial matchable.

Destructuring patterns can pull values out of a matchable,
using these sub-values as matchables for their own nested patterns.
For example, matching against `["foo"]`
will confirm the matchable itself is an array-like with one item,
then match the first item against the `"foo"` pattern.

### Match Clause
One "arm" of the match construct's contents,
consisting of an LHS (left-hand side) and an RHS (right-hand side).

The LHS looks like `when (<pattern>)`,
which matches its pattern against the matchable,
`if(<expr>)`,
which matches if the `<expr>` is truthy,
`when(<pattern>) if(<expr>)`,
which does both,
or `else`, which always succeeds but must be the final match clause.

(There is an open issue on how if/else should be spelled.)

The RHS is an arbitrary JS expression,
which the match construct resolves to if the LHS successfully matches.

### Guard

The `if(<expr>)` part of a match clause.
The `<expr>` sees bindings present at the start of the match construct;
if the match clause began with a `when(<pattern>)`,
it additionally sees all the bindings introduced by the pattern.

### Pattern
There are several types of patterns:

#### Primitive Pattern

Primitive literals, such as `1`, `NaN`, `false`, or `"foo"`.
Also some near-literal patterns,
such as `undefined` (technically just a variable, not a literal),
`-1` (technically the number 1 and the unary minus operator),
and `` `foo${bar}` `` (untagged template literals).

These match if the matchable is SameValueZero with them.
(Open issue: or SameValue semantics?)

They do not introduce a binding.
The set of near-primitive matchers is predefined, not an arbitrary expression:
`-Infinity` is allowed, but `-1 * Infinity` is not.
Interpolation in untagged template literals
sees the bindings present at the start of the match construct only.

#### Ident Pattern

Any identifier, such as `foo`.
These always match, and bind the matchable to the given binding name.

#### Regex Pattern

A regular expression literal.

The matchable is stringified, and the pattern matches if the regex matches the string.
If the regex defines named capture groups,
the names are automatically bound to the matched substrings;
in all cases, the match object is available for `with`-chaining
(as if it were a [custom matcher](#custom-matcher-protocol))


#### Interpolation pattern

An arbitrary JS expression
wrapped in `${}`,
just like in template literals.
For example, `${myVariable}`,
`${"foo-" + restOfString}`,
or `${getValue()}`.

The expression is evaluated;
if it resolves to a primitive value,
a Symbol,
or an object that *does not* implement the custom matcher protocol (see below),
the pattern matches if the matchable is SameValueZero with the result.
(Again, open issue if SameValue semantics should be used instead.)

If the result is an object that *does* implement the custom matcher protocol,
see below for matching rules.

If the interpolation pattern uses `with`-chaining,
it introduces the bindings introduced by the chained pattern;
otherwise it adds no bindings.

#### Array Pattern

A comma-separated list of zero or more patterns,
wrapped in square brackets,
like `["foo", a, {bar}]`.
The final item can be an "rest pattern",
looking like `...<ident>`.
(Aka, it looks like array destructuring.)

First, an iterator is obtained from the matchable:
if the matchable is itself iterable
(exposed a `[Symbol.iterator]` method)
that is used;
if it's array-like,
an array iterator is used.

Then, items are pulled from the iterator,
and matched against the array pattern's corresponding nested patterns.
If any of these matches fail,
the entire array pattern fails to match.

If the array pattern ends in a rest pattern,
the remainder of the iterator is pulled into an Array,
and bound to the ident from the array rest pattern,
just like in array destructuring.

If the array pattern does *not* end in a rest pattern,
the iterator must match the array pattern's length:
one final item is pulled from the iterator,
and if it succeeds (rather than closing the iterator),
the array pattern fails to match.

Iteration results for the matchable are cached for the lifetime of the match construct,
so that later clauses can reuse the results of an earlier iteration.
(This does mean that an earlier, longer array pattern that fails
can cause the iterator to have more items pulled from it
than the final matching clause might indicate.)

The array pattern introduces all the bindings introduced by its nested patterns,
plus the binding introduced by its rest pattern, if present.

#### Object Pattern

A comma-separated list of zero or more "object pattern clauses",
wrapped in curly braces,
like `{x: "foo", y, z: {bar}}`.
Each "object pattern clause" is either an `<ident>`,
or a `<key>: <pattern>` pair,
wher `<key>` is an `<ident>` or a computed-key expression like `[Symbol.foo]`.
The final item can be a "rest pattern",
looking like `...<ident>`.
(Aka, it looks like object destructuring.)

For each object pattern clause,
the matchable must contain a property matching the key,
and the value of that property must match the corresponding pattern;
if either of these fail for any object pattern clause,
the entire object pattern fails to match.

Plain `<ident>` object pattern clauses
are treated as if they were written `<ident>: <ident>`
(just like destructuring);
that is, the matchable must have the named property,
and the property's value is then bound to that name
due to being matched against an **ident matcher**.

If the object pattern ends in a rest pattern,
all of the matchables own keys that weren't explicitly matched by an object pattern clause
are bound into a fresh Object,
just like destructuring
or array patterns.

Unlike array patterns,
the lack of a final rest pattern imposes no additional constraints;
`{foo}` will match the object `{foo: 1, bar:2}`,
binding `foo` to `1` and ignoring the other key.

The object pattern introduces all the bindings introduced by its nested patterns,
plus the binding introduced by its rest pattern, if present.

#### Custom Matcher Protocol

When an [interpolation pattern](#interpolation-pattern)
results in an object,
if it has a `Symbol.matcher` property,
the value of that property is used to determine whether the pattern matches.

If the `Symbol.matcher` property is a function,
it's called with the matchable as its sole argument.
If the function successfully returns an object with a truthy `matched` property,
the pattern matches;
in any other case, the pattern fails.

##### Built-in Custom Matchers

All of the classes for primitive types
(`Boolean`, `String`, `Number`, `BigNum`)
expose a built-in `Symbol.matcher` method,
matching if and only if the matchable
is an object of that type, or a primitive corresponding to that type
(using brand-checking to check objects,
so boxed values from other windows will still match).
The custom matcher result for these classes is the primitive value.

All other platform objects also expose built-in `Symbol.matcher` methods,
matching if and only if the matchable
is of the same type
(again using brand-checking to verify,
similar to `Array.isArray()`).
The custom matcher result for these classes is the matchable itself.

Userland classes do *not* define a default custom matcher
(for both practical and technical reasons, see [issue 231](https://github.com/tc39/proposal-pattern-matching/issues/231)),
but it is very simple to define one in this style:

```js
class Foo {
  [Symbol.matcher](value) {
    return {
      matched: value instanceof Foo,
      value
    };
  }
}
````

#### `with`-chaining

An [interpolation pattern](#interpolation-pattern)
or a [regex pattern](#regex-pattern)
*may* also have a `with <pattern>` suffix,
allowing you to provide further patterns
to match against the first pattern's result.

The "custom matcher result" used as the matchable for the nested pattern
differs based on the parent pattern:
if the interpolation pattern invoked the custom match protocol,
the "custom matcher result" is the value of the `value` property on the result object;
if it didn't invoke the custom match protocol,
the "custom matcher result" is the original matchable itself;
if it's a regex pattern instead,
the "custom matcher result" is the regex's resulting match object.

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
  when (${MyClass}) true; // matches, doesn't use the result
  when (${MyClass} with {a, b: {c}}) do {
    // passes the custom matcher,
    // then further applies an object pattern to the result's value
    assert(a === 1);
    assert(c === 2);
  }
}
```

#### Combining Patterns

Two or more patterns can be combined with `|` or `&` to form a single larger pattern.

A sequence of `|`-separated patterns have short-circuiting "or" semantics:
the **or pattern** matches if any of the nested patterns match,
and stops executing as soon as one of its nested patterns matches.
It introduces all the bindings introduced by its nested patterns,
but only the *values* from its first successfully matched pattern;
bindings introduced by other patterns
(either failed matches,
or patterns past the first successful match)
are bound to `undefined`.

A sequence of `&`-separated patterns have short-circuiting "and" semantics:
the **and pattern** matches if all of the nested patterns match,
and stops executing as soon as one of its nested patterns fails to match.
It introduces all the bindings introduced by its nested patterns,
with later patterns providing the value for a given binding
if multiple patterns would introduce that binding.

Note that `&` can idiomatically be used to bind a matchable
and still allow it to be further matched against additional patterns.
For examle, `when (foo & [bar, baz]) ...` matches the matchable against both the `foo` ident matcher
(binding it to `foo` for the RHS)
*and* matches it against the `[bar, baz]` array matcher.

#### Parenthesizing Patterns

The pattern syntaxes do not have a precedence relationship with each other.
Any multi-token patterns
(`&`, `|`, `${...} with ...`)
appearing at the same "nesting level" are a syntax error;
parentheses must be used to to specify their relationship to each other instead.

For example, `when ("foo" | "bar" & val) ...` is a syntax error;
it must be written as `when ("foo" | ("bar" & val)) ...`
or `when (("foo" | "bar") & val)` instead.
Similarly, `when (${Foo} with bar & baz) ...` is a syntax error;
it must be written as `when (${Foo} with (bar & baz)) ...`
(binding the custom match result to both `bar` and `baz`)
or `when ((${Foo} with bar) & baz) ...`
(binding the custom match result to `bar`, and the *original* matchable to `baz`).

## Possible future enhancements

### `async match`

If the `match` construct appears inside a context where `await` is allowed, `await` can already be used inside it, just like inside `do` expressions. However, just like `async do` expressions, there’s uses of being able to use `await` and produce a Promise, even when not already inside an `async function`.

```jsx
async match (await matchable) {
  when ({ a }) { await a; }
  when ({ b }) { b.then(() => 42); }
  else { await somethingThatRejects(); }
} // produces a Promise
```

### Nil pattern
```jsx
match (someArr) {
  when [_, _, someVal] { … }
}
```

Most languages that have structural pattern matching have the concept of a “nil matcher”, which fills a hole in a data structure without creating a binding.

In JS, the primary use-case would be skipping spaces in arrays. This is already covered in destructuring by simply omitting an identifier of any kind in between the commas.

With that in mind, and also with the extremely contentious nature, we would only pursue this if we saw strong support for it.

### Dedicated renaming syntax

Right now, to bind a value in the middle of a pattern
but continue to match on it,
you use `&` to run both an ident matcher
and a further pattern
on the same value,
like `when (arr & [item]) ...`.

Langs like Haskell and Rust have a dedicated syntax for this,
spelled `@`;
if we adopted this, the above could be written as
`when (arr @ [item]) ...`.

Since this would introduce no new functionality,
just a dedicated semantic for a common operation
and syntactic concordance with other languages,
we're not pursuing this as part of the base proposal.

### Destructuring enhancements

Both destructuring and pattern matching should remain in sync, so enhancements to one would need to work for the other.

### Catch guards

Allow a `catch` statement to conditionally catch an exception:

```jsx
try {
  throw new TypeError('a');
} catch match (e) {
  if (e instanceof RangeError) { … }
  when (/^abc$/) { … }
  else { throw e; } // default behavior
}
```


<!--
## Implementations

* [Babel Plugin](https://github.com/babel/babel/pull/9318)
* [Sweet.js macro](https://github.com/natefaubion/sparkler) (NOTE: this isn’t based on the proposal, this proposal is partially based on it!)
-->
