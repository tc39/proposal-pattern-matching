# ECMAScript Pattern Matching - Beyond This Spec

These are some things we consider out of scope for this particular spec, and
thus are tremendously unlikely to be included as part of this proposal, but that
are compelling enough and related to pattern matching that they might be
interesting to pursue -- specially after this spec is further along or even
widely available.

## Table of Contents

* [`catch` matching](#catch-match)
* [`if match`](#if-match)
* [`async match`](#async-match)
* [Match Arrow functions](#match-arrow)
* [Compound Matchers](#compound-matcher)
* [Variable pinning operator](#variable-pinning-operator)
* [Unbound array rest parameters](#unbound-array-rest)

## <a name="catch-match"></a> > Destructuring matches on `catch`

Essentially, adding a special syntax to `catch` so it can use pattern matching
to do conditional clauses. In this particular case, the `match` keyword and
parameter could be omitted altogether while retaining backwards-compat (I
think):

```js
try {
  ...
} catch ({code: 'ENOENT'}) {
  ...
} catch (BadError err) {
  ...
} catch ({exitCode} if (exitCode > 1)) {
  ...
} catch (err) {
  // Stays the same whether or not `catch` interprets param as a match
  ...
}
```

## <a name="if-match"></a> > `if match` Convenience Sugar

There are cases where `match` can be clunky or awkward, but the power of its
pattern match is still desired. This happens primarily when a `match` expression
has only a single non-trivial leg, usually with a fallthrough:

```js
match (opt) {
  when Some~x ~> console.log(`Got ${x}`)
  when _ ~> {}
}
```

In this case, one might use an `if match` form or similar:

```js
if match (opt when Some~x) {
  console.log(`Got ${x}`)
}
```

I'm not even touching what the right syntax for this should be, but there's [a
nice Rust RFC](https://github.com/rust-lang/rfcs/pull/160) that explains the
feature, and it seems to be well-liked among Rust developers.

## <a name="async-match"></a> > `async match () {}`

I'm not sure whether this would ever be necessary, but it's probably worth
mentioning anyway. It's probably a completely pointless idea.

## <a name="match-arrow"></a> > Match Arrow functions

Because of the similarity between clause bodies and arrow functions, it might be
interesting to explore the idea of something like a "match arrow" function that
provides a concise syntax for a single-leg `match` statement:

```js
const unwrap = v => { match (v) when Some#x ~> return x }
```

Possibly taking it even further and making a shorthand that automatically
creates an arrow, taking the place of something like `async`:

```js
const unwrap = match (Some#x) => x
unwrap(new Some('hello')) // 'hello'
unwrap(None) // MatchError
```

## <a name="compound-matcher"></a> > `&&` and `||`

`&&` and `||` are special compound matchers that allow you to join multiple
match clauses to express a range of possibilities in a match. They are analogous
to the regular boolean operators `&&` and `||`, except their comparisons are
whether matches succeeded or not -- rather than the actual value being matched
in the expression. Both operators have the same short-circruiting semantics as
their boolean counterparts.

You can use `&&` and `||` between expressions at any level where matchers are
accepted. Guards are not included in these expressions, as there must be only
one.

When multiple variable-binding clauses are present, all referenced variables
will be declared in the clause body, with variables in later cases shadowing
earlier ones when they overlap.

In the case of `||`, variables that are only present in a failed or unreached
match will be left `undefined`, and the successful clause will take precedent
over other bindings, since it's the only one that will actually bind values.

##### Example

```js
match (x) {
  when 1 || 2 || 3 ~> ...
  when [1, y] && {x: y} ~> ... // Both `x` and `y` are bound to their matches
  when {a: 1, x} || {a: 2, y} ~> ... // Both `x` and `y` are declared.
                                     // Only one of the two will be defined.
}
```

There are some choices that can be made for supporting the OR and AND compound
matchers. This spec currently uses Option A, which is to use `||` and `&&` for
those operations. Note that any operators that have correspondence to existing
semantics will necessarily have overloaded meaning in match expressions, because
compound matchers always work based on match success, not actual value (so `null
OR 0 OR false` succeeds if the value is either of those two values, regardless
of their falsiness as values).

##### Option A: `||` and `&&`

This is what the current spec describes. It has the advantage that it's a fairly
straightforward logical mapping for a boolean operation developers are already
used to. It has the disadvantage that it it a straightforward logical mapping
for a boolean operation developers are already used to. Another advantage is
that its short-circuiting semantics would be easier to understand because they
work the same as the existing `||` and `&&` operators.

The main conflict here is for matches such as `null || false || 0`, which can
succeed if the matched value is any of those three -- whereas such an expression
would never succeed in its regular context.

```js
match (x) {
  when 1 || 2 || null || 0 ~> ...
  when {x: 1} && {y: 2} ~> ...
}
```

##### Option B: `|` and `&`

This is similar to Option A, but overloading bitwise operators, which are less
commonly used and easily distinguished from the boolean ones. Rust itself uses `|`
for its alternatives, and has no support (that I know of) for an equivalent of `&`.

For this option, it's also reasonable and possible to pick a different operator
for `&` and keep `|` as a "bar".

```js
match (x) {
  when 1 | 2 | null | 0 ~> ...
  when {x: 1} & {y: 2} ~> ...
}
```

##### Option C: `:` and `,`

This would revert things back to a previously-proposed possibility, where `:`
would work as a fallthrough, and `,` as a joiner. This would not change usign `~>`
as the body separator, though:

```js
match (x) {
  when 1: 2: null: 0 ~> ...
  when {x: 1}, {y: 2} ~> ...
}
```

##### Option D: `and` and `or`

This would add `and` and `or` keywords rather than use non-alpha characters:

```js
match (x) {
  when 1 or 2 or null or 0 ~> ...
  when {x: 1} and {y: 2} ~> ...
}
```

This would involve adding `and` and `or` as reserved words for the language, and
possibly confuse people who then try to use that instead of `||` and `&&`
(essentially the reverse problem or using those booleans).

##### Option E: Go Full Erlang! `;` and `,`

As an honorary mention that oh no someone might actually take seriously: we
could pick up [Erlang's syntax for multiple
guards](https://en.wikibooks.org/wiki/Erlang_Programming/guards#Multiple_guards),
where `;` acts as an OR and `,` as an AND.

```js
match (x) {
  when 1; 2; null; 0 ~> ...
  when {x: 1}, {y: 2} ~> ...
}
```

Please no?

## <a name="variable-pinning-operator"></a> > Pin operator

Since this proposal [treats variables as universal
matches](#variables-always-assign), it leaves some space as far as what should
actually be done to match against variables in the scope, instead of literals.

This proposal initially assumes that guards will be used in cases like these,
since they should generally work just fine, but there's also the possibility of
incorporating [a pin
operator](https://elixir-lang.org/getting-started/pattern-matching.html), like
Elixir does, for forcing a match on a variable. This would work out to a
shorthand only for primitive values.

Using the operator directly from Elixir:

```js
const y = 1
match (x) {
  when ^y ~> 'x is 1'
  when x if (x === y) ~> 'this is how you would do it otherwise'
}
```

A more compelling reason to have this terseness might be to allow matches on
`Symbol`s or other "constant"-like objects:

```js
import {FOO, BAR} from './constants.js'

match (x) {
  when ^FOO => 'x was the FOO constant'
  when ^BAR => 'x was the BAR constant'
}
```

It's also possible to choose all sorts of different operators for this, but I'm
just using whatever Elixir does for this bit.

An alternative might also be to use custom matcher objects/functions to allow
this sort of equality:

```js
import {FOO, BAR} from './constants.js'

class ConstantMatcher {
  constructor (val) { this.val = val }
  [Symbol.patternMatch] (val) { return this.val === val }
}
function ByVal (obj) {
  return new ConstantMatcher(obj)
}

match (x) {
  when ByVal(FOO)~_ => 'got a FOO',
  when ByVal(BAR)~_ => 'got a BAR'
}
```

This might be enough, and might even be a reason to consider a built-in version
of this extractor.

## <a name="unbound-array-rest"></a> > Binding-less array rest

In ECMAScript, `var [a, b, ...rest] = arr` allows binding of "the rest" of the
array into a variable. This syntax, though, requires that the "rest" value be
bound to a specific variable. That is, `[a, b, ...]` is invalid syntax.

The previous pattern matching proposal included syntax that allowed this to be
the case, but only inside the LHS of `match`. It's possible the syntax could be
added, but there's also a question of whether it's necessary, since variables in
this proposal are always bound, rather than used for arbitrary matchin as in the
previous proposal -- there's little use for allowing plain `...` params besides
not wanting to have an unbound variable. That is, `[a, b, ..._]` achieves
essentially the same thing `[a, b, ...]` does.
