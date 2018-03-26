# ECMAScript Pattern Matching - Core Functionality

## [Status](https://tc39.github.io/process-document/)

**Stage**: 0

**Author**: Kat Marchán (npm, [@maybekatz](https://twitter.com/maybekatz))

**Champions**: Brian Terlson (Microsoft, [@bterlson](https://twitter.com/bterlson)), Sebastian Markbåge (Facebook, [@sebmarkbage](https://twitter.com/sebmarkbage)), Kat Marchán (npm, [@maybekatz](https://twitter.com/maybekatz))

## Table of Contents

* [Introduction](#introduction)
* [1 Match Operator](#match-operator)
  * [Syntax](#match-syntax)
  * [1.1 Static Semantics: Early Errors](#match-ss-errors)
  * [1.2 Runtime Semantics: IsFunctionDefinition](#match-rs-fn-def)
  * [1.3 Runtime Semantics: IsValidSimpleAssignmentTarget](#match-rs-valid-sat)
  * [1.4 Runtime Semantics: Evaluation](#match-rs-eval)
* [Annex A: Design Decisions](#annex-a)
  * [No Clause Fallthrough](#no-fallthrough)
  * [Variables Always Assign](#variables-always-assign)
  * [`Object.is` for non-collection literals](#object-is-comparison)
  * [Fat arrow-style bodies](#fat-arrow-bodies)
* [Annex B: Performance Considerations](#annex-b)

## Introduction

This proposal adds a pattern matching expression to the language, based on the
existing [Destructuring Binding
Patterns](https://tc39.github.io/ecma262/#sec-destructuring-binding-patterns).
Pattern matching is a widely-applicable feature that often becomes core to the
way developers end up writing code logic, and JavaScript's reliance on
structural similarities for its various operations make it a compelling use-case
for such a feature.

This proposal draws heavily from corresponding features in
[Rust](https://doc.rust-lang.org/1.6.0/book/patterns.html),
[F#](https://docs.microsoft.com/en-us/dotnet/fsharp/language-reference/pattern-matching),
[Scala](http://www.scala-lang.org/files/archive/spec/2.11/08-pattern-matching.html),
and [Elixir](https://elixir-lang.org/getting-started/pattern-matching.html).

## <a name="match-operator"></a> 1 Match Operator

### <a name="match-syntax"></a> Syntax

```
PrimaryExpression :
  MatchExpression

MatchExpression :
  // Note: this requires a cover grammar to handle ambiguity
  // between a call to a match function and the match expr.
  `match` [no |LineTerminator| here] `(` Expression `)` [no |LineTerminator| here] `{` MatchClauses `}`

MatchClauses :
  MatchClause
  MatchClauses `,` MatchClause `,`[opt]
  MatchClauses `,` MatchClause

MatchClause :
  MatchPattern MatchGuard[opt] `=>` ConciseBody

MatchGuard :
  `if` `(` Expression `)`

MatchPattern :
  ObjectMatchBinding
  ArrayMatchBinding
  IdentifierMatchBinding
  LiteralMatchBinding

ObjectMatchBinding :
  `{` `}`
  `{` MatchRestProperty `}`
  `{` MatchPropertyList `,` MatchRestProperty[opt] `}`

MatchPropertyList :
  MatchProperty
  MatchPropertyList `,` MatchProperty

MatchProperty
  SingleNameBinding Initializer[opt]
  PropertyName `:` MatchElement

MatchRestProperty :
  `...` IdentifierMatchBinding

ArrayMatchBinding :
  `[` `]`
  `[` Elision[opt] MatchRestElement `]`
  `[` MatchElementList `]`
  `[` MatchElementList `,` Elision[opts] MatchRestElement[opt] `]`

MatchElementList :
  MatchElisionElement
  MatchElementList `,` MatchElisionElement

MatchElisionElement :
  Elision[opt] MatchElement Initializer[opt]

MatchElement :
  MatchPattern

MatchRestElement :
  `...` IdentifierMatchBinding
  `...` MatchElement

IdentifierMatchBinding :
  BindingIdentifier

LiteralMatchBinding :
  NullLiteral
  BooleanLiteral
  NumericLiteral
  StringLiteral
  RegularExpressionLiteral

From Ecma-262 :
  PrimaryExpression
  LineTerminator
  ConciseBody
  Expression
  AssignmentExpression
  SingleNameBinding
  Elision
  BindingIdentifier
  NullLiteral
  BooleanLiteral
  NumericLiteral
  StringLiteral
  RegularExpressionLiteral
```

### <a name="match-ss-errors"></a> 1.1 Static Semantics: Early Errors

TKTK

### <a name="match-rs-fn-def"></a> 1.2 Runtime Semantics: IsFunctionDefinition

TKTK

### <a name="match-rs-valid-sat"></a> 1.3 Runtime Semantics: IsValidSimpleAssignmentTarget

TKTK

### <a name="match-rs-eval"></a> 1.4 Runtime Semantics: Evaluation

##### MatchEval Code Summary

Match logic:

```js
const val = match (input) {
  {x: 1} => ..., // matches if `input` can do ToObject and `input.x` is 1
  [1,2] => ..., // matches if `input` can do ToObject, `input.length` is 2, `input[0]` is 1, and `input[1]` is 2
  1 => ..., // matches if `input` is 1
  'foo' => ..., // matches if `input` is 'foo'
  false => ..., // matches if `input` is `false`
  null => ..., // matches if `input` is `null`
  /^foo/ => ..., // matches if `input` is a string that starts with 'foo'
  {x} if (myCheck(x)) => ..., // matches if `input` can do ToObject, if `input.x` is not `undefined`, and if `myCheck(input.x)` is true
  x => ..., // always matches
}
```

Rest params:
```js
match (input) {
  {x, ...y} => ..., // binds all-other-properties to `y`.
  {x, ...{y}} => ..., // SyntaxError
  [1, ...etc] => ...,
  [1, ...[2]] => ... // Recursive matching on `rest` is allowed
}
```

Basic ConciseBody return:
```js
const val2 = match (input) {
  {x} => x
}
// if `input` is {x: 1}, `val2` is 1
```

Curly brace ConciseBody:
```js
match (input) {
  {x} => {
    console.log(x)
    return x // return required, just like arrows, to return a value
  }
}
```

Initializers:
```js
match (input) {
  // matches if `input` is an object, whether or not it has an `x` property, and
  // sets `x` to `1` if `x` does not already exist on the object
  {x} = {x: 1} => ...,
}
```

Pathological case: non-primitive built-in variables.
```js
match (input) {
  Infinity => ..., // always matches, sets a local `Infinity` to `input`
  -Infinity => ..., // SyntaxError: not a MatchPattern
  undefined => ..., // always matches, assigns `input` to local `undefined` var
  NaN => ... // ditto. rip 💀
}
```

#### MatchEvaluation (initial sketch)

1. evaluate Expression and assign the value to `input`
1. For each MatchClause in MatchClauses:
  1. if no MatchClause left, throw MatchError
  1. if MatchPattern is ObjectMatchBinding, perform lret = ObjectMatchEvaluation(input, env)
  1. if MatchPattern is ArrayMatchBinding, perform lret = ArrayMatchEvaluation(input, evn)
  1. if MatchPattern is LiteralMatchBinding, perform lret = LiteralMatchEvaluation(input, env)
  1. if MatchPattern is IdentifierMatchBinding, perform lret = IdentifierMatchBinding(input, env)
  1. if lret is true:
    1. if MatchGuard exists, perform lret = MatchGuardExpr(env)
    1. if MatchGuard does not exist, or lret is true, exit loop
  1. if lret is false: continue loop
1. Perform ret = ConciseBodyEval(env)
1. return ret

## Annex A

These are key, intentional design desicions made by this proposal in particular
which I believe should stay as they are, and why:

### <a name="no-fallthrough"></a> > No Clause Fallthrough

As part of distancing this feature from `switch`, and focusing on semantics that
work best for it, fallthrough is not possible between multiple legs. It is
expected that match clause are complete enough for picking a single leg, and
further skipping can be done using guards or nested `match`.

```js
match (x) {
  {x: 1, y} if (y <= 10) => ...
  {x: 1} => ...
}
```

Probably the biggest advantage of preventing fallthroughs is that it clarifies
scoping so much, and prevents really complicated and footgun-y cases where
previous scopes might suddenly inject variables into further-down bodies:

```js
match (x) {
  y if (y < 10) => {
    x = 10
    continue // from the previous version of this proposal
  }
  y if (y >= 10) => {
    console.log(y, x) // what are x and y? Does this clause even run?
  }
}
```

It is the opinion of the authors that fallthrough, though often mentioned, is
neither essential, nor as straightforward or as convenient as it might sound.
It's a scoping and matching footgun and prone to defeating various optimizations
that could be applied (ahead-of-time PIC-based branch filtering, for example).
You may as well add fallthrough support to `if`.

It will not be included as part of this proposal, but future, dedicated
proposals might try to introduce it.

### <a name="variables-always-assign"></a> > Variables always assign

When the match pattern is a variable, it should simply assign to that variable,
instead of trying to compare the value somehow. No variable binding prefix is
required or supported -- variables bound in a `match` behave just like function
arguments.

```js
const y = 2
match (1) {
  y => x === y // y is bound to 1
}
```

Guards can be used instead, for comparisons:

```js
const y = 2
match (1) {
  y if (y === 2) => 'does not match',
  x if (x === 1) => 'x is 1'
}
```

See also [the bikeshed about pinning](#variable-pinning-operator) for a proposal
on how to allow variable-based matching.

##### Benefits:

* Follows the precedent of almost every other match implementation I could find. This is about as universal as I think this gets? Swift is the only exception, requiring a `let` before a variable that's intended to be bound.
* Consistent behavior: No ambiguity when a variable is not assigned vs when it's suddenly assigned in the scope. Behavior will remain the same.
* Eliminates the need for an `else`/`default` leg, because assignment to any variable will be sufficient. JS programmers are already used to assigning variables that are then ignored (in functions, in particular), and different people have different tastes in what that should be. `_`, `other`, etc, would all be perfectly cromulent alternatives.

### <a name="object-is-comparison"></a> > Primitives compared with `Object.is`

This proposal special-cases Array, Object, and RegExp literal matches to make
them more convenient and intuitive, but Numbers, Strings, Booleans, and Null are
always compared using `Object.is`:

```js
match (x) => {
  1 => 'x is 1',
  'foo' => 'x is foo',
  null => 'x is null (not undefined)'
}
```

See also [the bikeshed about special-casing the `null` matcher](#null-punning),
as well as the one [about making `undefined` another "primitive"
matcher](#undefined-match).

#### > Only one parameter to match against

`match` accepts only a single argument to match against. This is sufficient,
since arrays can be used with minimal syntactic overhead to achieve this effect:

```js
match ([x, y]) {
  [1, 2] => ...
}
```

(versus `match (x, y) ...`)

### <a name="fat-arrow-bodies"></a> > `=>` for leg bodies

The previous `match` proposal used `:` as the separator between matchers and
bodies. I believe `=>` is a better choice here due to its correspondence to fat
arrows, and how similar the scoping/`{}` rules would be. Bodies should be
treated as expressions returning values, which is very different from how
`switch` works. I believe this is enough reason to distance `match`'s leg syntax
from `switch`'s.

```js
match (x) {
  foo => foo + 1,
  {y: 1} => x.y === y,
  bar => {
    console.log(bar)
    return bar + 2
  }
}
```

There are many possibilities when it comes to this particular aspect of the
syntax. Without more concrete data on usability of these sorts of statements
(surveys, interviews with educators, speed/accuracy research, etc), I believe
the factors that made me choose this syntax are strong enough to justify it:

* It retains most of the terseness of `:`.
* It distances `match` from `switch` and its very different semantics.
* Makes it clearer that leg bodies have Arrow-style scoping and semantics.
* Makes the match pattern look more like a destructured function parameter.
* Avoids repetitive prefixing of `case` keywords.
* It's used by both Rust and Scala, the two implementations that imo are
  semantically closest to this proposal (and both have clearly C-style syntax).
  They are both fairly popular languages, so the familiarity might further help.

If more decisions are to be made around this, I would rather do so with more
data, as minor syntactic bikesheds can turn into joyless pits of despair over
mere "taste" and subjective experiences.

## <a name="annex-b"></a> Annex B: Performance Considerations

The general design of this `match` leans heavily towards hopefully allowing
compiler-side optimizations. By minimizing runtime generation of matching logic,
most match clauses can be filtered according to PIC status
(monomorphic/polymorphic/etc), as well as by Map ("hidden classes"). A smart
enough compiler should be able to reorder and omit branches and possibly reduce
certain simpler match expressions to what a low-level `switch` might be.

The fact that variable matchers do not need to match against variables in
surrounding scopes, and worry about their internal types, is probably also a big
advantage -- variable bindings are simply typed the same as the corresponding
value passed into `match` (again, optimized with PICs).

The main showstoppers for this sort of analysis are, I think,
[extractors](#extractors) and perhaps guard expressions. Neither of these
features are optimized to be users' main code paths, and performance-sensitive
code can be rewritten to remove these extensions as needed.

Complex compounds might also cause issues (`&&`/`||`), but these can be
optimized if all clauses have identical-typed matchers (`1 || 2 || 3 => ...`).

I'm not a browser engine implementer, though, so I'm probably way off base with
what would actually have an impact on performance, but I figured I should write
a bit about this anyway.
