# ECMAScript Pattern Matching

## [Status](https://tc39.github.io/process-document/)

**Stage**: 1

**Authors**: Originally Kat Marchán (Microsoft, [@zkat__](https://twitter.com/zkat__)); now, the below champions.

**Champions**: Jordan Harband (Coinbase, [@ljharb](https://twitter.com/ljharb)), Mark Cohen ([@mpcsh_](https://twitter.com/mpcsh_)), Tab Atkins-Bittner (Google, [@tabatkins](https://twitter.com/tabatkins)), Yulia Startsev (Mozilla, [@ioctaptceb](https://twitter.com/ioctaptceb)), Daniel Rosenwasser (Microsoft, [@drosenwasser](https://twitter.com/drosenwasser)), Jack Works (Sujitech, [@Jack-Works](https://github.com/Jack-Works)), Ross Kirsling (Sony, [@rkirsling](https://twitter.com/rkirsling))

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

## Code samples

```jsx
    match (res) {
//  match (matchable) {
      when ({ status: 200, body, ...rest }) {
//    when (pattern) { … }
//    ───────↓────── ───↓───
//          LHS        RHS (sugar for do-expression)
//    ───────────↓──────────
//            clause
        handleData(body, rest);
      }

      when ({ status: 301 | 304, destination: url }) {
//      ↳ `|` (pipe) is the “or” combinator
//      ↳ `url` is an irrefutable match, effectively a new name for `destination`
        handleRedirect(url);
      }

      when ^retryable { retry(req); }
//      ↳ parentheses are not required around simple “pin” patterns

      else { throwSomething(); }
//      ↳ cannot coexist with top-level irrefutable match, e.g. `when (foo)`
    }
```
 - `res` is the “matchable”. This can be any expression.
 - `when … { … }` is the “[clause](#clause)”.
 - the `…` in `when (…)` is the “pattern”.
 - Everything after the pattern is the “right-hand side” (RHS), and is sugar for a [`do` expression](https://github.com/tc39/proposal-do-expressions).
 - `301 | 304` uses `|` to indicate “or” semantics for multiple patterns
 - Any valid object or array destructuring is a valid pattern
 - An explicit `else` [clause](#clause) handles the “no match” scenario by always matching. It must always appear last when present, as any [clauses](#clause) after an `else` are unreachable.

---

```jsx
match (command) {
  when ([ 'go', ('north' | 'east' | 'south' | 'west') as dir ]) { … }
  when ([ 'take', item ]) { … }
  else { … }
}
```
This sample is a contrived parser for a text-based adventure game. Note the `as` keyword, which introduces bindings. In this case, the first clause will match on any of the four compass directions, binding whatever is passed in to `dir` for the right-hand side.

---

```jsx
match (res) {
  if (isEmpty(res)) { … }
  when ({ pages, data }) if (pages > 1) { … }
  when ({ pages, data }) if (pages === 1) { … }
  else { … }
}
```
This sample is fetching from a paginated endpoint. Note the use of **guards** (the `if` statements), which provide additional conditional logic where patterns aren’t expressive enough.

---

```jsx
match (res) {
  if (isEmpty(res)) { … }
  when ({ data: [page] }) { … }
  when ({ data: [frontPage, ...pages] }) { … }
  else { … }
}
```
This is another way to write the previous code sample without a guard, and without checking the page count.

The first `when` clause matches if `data` has exactly one element, and binds that element to `page` for the right-hand side. The second `when` clause matches if `data` has at least one element, binding that first element to `frontPage`, and an array of any remaining elements to `pages`.

Note that for this to work properly, iterator results will need to be cached until there’s a successful match, for example to allow checking the first item more than once.

---

```jsx
match (arithmeticStr) {
  when (/(?<left>\d+) \+ (?<right>\d+)/ as { groups: { left, right } }) { process(left, right); }
  when (/(?<left>\d+) \+ (?<right>\d+)/) { process(left, right); } // maybe?
  else { ... }
}
```
This sample is a contrived arithmetic expression parser. Regexes are patterns, with the expected semantics.

Named capture groups motivate the [user-extensible protocol](#user-extensibility). It would be intuitive for named capture groups to introduce bindings to the right-hand side. And surely, if regexes can do this, then userland objects should be able to do this as well.

Note the use of the `as` keyword to pattern-match the result of this matching protocol (read on for a few more code samples for further detail on this protocol).

Additionally, it would be nice for regex literals to be able to introduce bindings *without* the `with` keyword. This would be a magic special case, but we find it acceptable since it’s still possible to statically analyze the source of all bindings.

---

```jsx
const LF = 0x0a;
const CR = 0x0d;
match (token) {
  when ^LF { ... }
  when ^CR { ... }
  else { ... }
}
```
Here we see the **pin operator** (`^`), which is the escape-hatch from irrefutable matches.

Without `^`, `LF` would be an **irrefutable match**, which would always match regardless of the value of the matchable (`token`, here). Then, in the right-hand side, `LF` would be bound to the value of `token`, shadowing the outer `const LF = 0x0a` binding at the top.

With `^`, `LF` is evaluated as an expression, which results in the primitive value `0x0a`. This is then matched against `token`, and the clause matches only if `token` is `0x0a`. The right-hand side sees no new bindings.

`^` can only be followed by an identifier (`^foo`), a function call (`^foo()`), a chain with optional final function call (`^foo.bar.baz` or `^foo.bar.baz("qux")`), or a parenthesized expression.

Parentheses are not required around a simple pin pattern (a pin pattern consisting of an identifier or function call or chain with optional final function call).

*Note: the champions group is not settled on `^`, and is very open to different sigils, a keyword, or any other ideas to distinguish expressions from irrefutable matches.*

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
  when (^Name with [first, last]) if (last.includes('-')) { … }
  when (^Name with [first, last]) { … }
  else { … }
}
```
This sample has two significant parts. First is a contrived name parser, which simply tries to split a string into exactly two space-separated pieces. This parser is contained in a special static `[Symbol.matcher]()` method. Next is a `match` construct with three clauses: the first matches hyphenated last names, the second matches all names, and the third (the `else`) matches anything.

In this case, the pin operator functions a little differently. `Name` is still evaluated as an expression, but this time, the result is a class. The engine would then check if that class has a static `[Symbol.matcher]()` method, and if so, calls that method on the matchable.

We also see the `with` keyword, which is used to destructure and match against the value returned by the matcher protocol.

This operator is probably the thing we’re least happy with, as a champions group. This turns out to be a hard problem to solve. Prior art is a bit of a mixed bag; this is Elixir’s approach. We’re very open to other spellings and other ideas.

## Motivating Examples

Matching `fetch()` responses:
```jsx
const res = await fetch(jsonService)
match (res) {
  when ({ status: 200, headers: { 'Content-Length': s } }) {
    console.log(`size is ${s}`);
  }
  when ({ status: 404 }) {
    console.log('JSON not found');
  }
  when ({ status }) if (status >= 400) {
    throw new RequestError(res);
  }
};
```

---

More concise, more functional handling of Redux reducers. Compare with [this same example in the Redux documentation](https://redux.js.org/basics/reducers#splitting-reducers):
```jsx
function todoApp(state = initialState, action) {
  return match (action) {
    when ({ type: 'set-visibility-filter', payload: visFilter }) {
      ({ ...state, visFilter });
    }
    when ({ type: 'add-todo', payload: text }) {
      ({ ...state, todos: [...state.todos, { text, completed: false }] });
    }
    when ({ type: 'toggle-todo', payload: index }) {
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
    else { state } // ignore unknown actions
  }
}
```

---

Concise props handling inlined with JSX (via [Divjot Singh](https://twitter.com/bogas04/status/977499729557839873)):
```jsx
<Fetch url={API_URL}>
  {props => match (props) {
    when ({ loading }) { <Loading />; }
    when ({ error }) { <Error error={error} />; }
    when ({ data }) { <Page data={data} />; }
  }}
</Fetch>
```

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

### AND combinator (`&`)

The OR combinator (`|`) that we saw earlier tries patterns until one succeeds; this tries patterns until one fails. It allows for more expressive match clauses without having to reach for guards.

There is no precedence relationship between `|` and `&`, so they cannot be mixed at the same expression level; parentheses are required to avoid the early syntax error.

### Nil pattern
```jsx
match (someArr) {
  when ([_, _, someVal]) { … }
}
```

Most languages that have structural pattern matching have the concept of a “nil matcher”, which fills a hole in a data structure without creating a binding.

In JS, the primary use-case would be skipping spaces in arrays. This is already covered in destructuring by simply omitting an identifier of any kind in between the commas.

With that in mind, and also with the extremely contentious nature, we would only pursue this if we saw strong support for it.

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

### Sugar for clause RHS as single expression

To avoid the extra boilerplate of `{ }`. This would require an explicit separator, to allow for object literals in the bare expression form versus a statement list in the `do` expression form.

Using an above example:
```jsx
const getLength = vector => match (vector) {
  when ({ x, y, z }) Math.hypot(x, y, z);
  when ({ x, y }) Math.hypot(x, y);
  when ([...etc]) vector.length;
};
```

## Terminology
Terms we use when discussing this proposal:

### Match construct
Refers to the entire `match (…) { … }` expression.
### Matchable
The expression to match against; shows up in `match (matchable) { … }`.
TODO: non-top-level matchables

### Pattern
There are several types of patterns:

#### “Leaf” patterns
- Primitives, and near-primitives: such as `1`, `false`, `undefined`, `-Infinity`, `"foo"`. These match if the matched value is SameValueZero with them. They do not introduce a binding. The set of near-primitive matchers is predefined. It’s not an arbitrary expression: `-Infinity` is allowed, but `-1 * Infinity` is not.
- Irrefutable match / identifier pattern: any identifier, such as `foo`. These always match, and bind the matched value to the given binding name.
- Regex literal pattern: the pattern can be any regular expression literal. The matchable is stringified, and this [clause](#clause) matches if the regex matches. If the regex defines named capture groups, the names are automatically bound to the matched substrings.

#### Destructuring patterns

##### Array/iterable destructuring

These contain a comma-separated list of zero or more [patterns](#patterns), possibly ending in rest syntax (like `...rest`).

This pattern first verifies that the matched value is iterable, then obtains and consumes the entire iterator. If the result doesn’t have enough values for the provided patterns, the match fails. If the matcher doesn’t end with rest syntax, and the iterator has leftover values after the provided [patterns](#patterns), the match fails (so `[a, b]` only matches things with exactly two items). It then recursively applies the [patterns](#patterns) to the corresponding items from the iterator, matching only if all of the child [clauses](#clause) match. It accumulates the bindings from each child [pattern](#patterns), and if it ends in rest syntax (like `...someIdentifier`), binds the remainder of the iterator’s values in a fresh Array to that identifier as well.

Iteration results for the matchable are cached for the lifetime of the overarching match construct, so that successive iterations are not required.

##### Object destructuring

Contains a comma-separated list of `<ident>` or `<key>`: `<pattern>` entries. A key is either an ident, like `{ foo: … }`, or a computed-key expression, like `{ [Symbol.foo]: … }`.

An `<ident>` by itself (not followed by a `: <pattern>`), is treated as if it was followed by an ident pattern of the same name: `{ foo }` and `{ foo: foo }` are equivalent (just like in destructuring).

The [pattern](#patterns) requires the key to exist on the matched value; if it’s missing, the match fails. The value of the key is then matched against the pattern provided after the key; if that fails, the match fails.

Like array destructuring patterns, the object destructuring pattern can also contain rest syntax (like `...someIdentifier`), which creates a fresh `Object` containing all the keys of the matched value that weren’t explicitly matched, and binds it to the provided identifier (just like in object destructuring).

### Custom expression matchers

Any identifier, dotted or bracketed expressions, and/or function calls can be immediately prefixed with [`^`](#pin-operator). Anything more complex must be wrapped in parentheses such as `^(foo + 1)`.

The expression following `^` is then evaluated. If the result is an Object with a `[Symbol.matcher]` key, then the engine fetches that key, throws if it’s present and not a function, and calls it on the matchable. The result, like `IterationResult`s, must return an `Object`, with a truthy `matched` property, for the match to be considered successful.

Otherwise, a `SameValueZero` test is performed against the matchable.

If the match is successful and the custom matcher has an `as` binding declared, the `value` property on the MatchResult object will be used for that binding. Example:
```jsx
const hasMatcher = {
  [Symbol.matcher](matchable) {
    return {
      matched: matchable === 3,
      value: { a: 1, b: { c: 2 } },
    };
  }
};
match (3) {
  when (^hasMatcher as { a, b: { c } }) {
    assert(a === 1);
    assert(c === 2);
  }
}
```

### Combinators
Patterns can be joined together with a combinator - like `|` which has short-circuiting “or” semantics, or perhaps `&` which has short-circuting “and” semantics. Patterns can also be followed by `with <pattern>`, which for a custom matcher will match against the matcher protocol’’s returned value.

### Clause
This refers to either a `when` and its associated pattern or an `else`, and the expression representing the RHS
TODO: bare guards, `with`, `as`, etc; “intuitive” definition

### Right-hand side (RHS)
The statement list (surrounded with curly braces, with `do` expression semantics), or possibly expression, that evaluates when a [clause](#clause) matches successfully, and produces the value that the surrounding `match` construct evaluates to.

### Pin operator (`^`)
May appear inside any [pattern](#pattern), immediately preceding an identifier (`^Foo`), a chained expression (`^foo?.bar.Class`), a function call (`^foo()` or `^foo.bar()`), or a parenthesized expression (`^(<any expression>)`). Used to escape from “pattern mode” and enter “expression mode”.


<!--
## Implementations

* [Babel Plugin](https://github.com/babel/babel/pull/9318)
* [Sweet.js macro](https://github.com/natefaubion/sparkler) (NOTE: this isn’t based on the proposal, this proposal is partially based on it!)
-->
