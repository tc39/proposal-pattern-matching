# ECMAScript Pattern Matching - Core Functionality

## [Status](https://tc39.github.io/process-document/)

**Stage**: 0

**Author**: Kat Marchán (npm, [@maybekatz](https://twitter.com/maybekatz))

**Champions**: Brian Terlson (Microsoft, [@bterlson](https://twitter.com/bterlson)), Sebastian Markbåge (Facebook, [@sebmarkbage](https://twitter.com/sebmarkbage)), Kat Marchán (npm, [@maybekatz](https://twitter.com/maybekatz))

## Table of Contents

* [Introduction](#introduction)
* [The Big Picture](#big-picture)
* [1 Match Statement](#match-statement)
  * [Syntax](#match-syntax)
  * [1.1 Static Semantics: Early Errors](#match-ss-errors)
  * [1.2 Runtime Semantics: IsFunctionDefinition](#match-rs-fn-def)
  * [1.3 Runtime Semantics: Evaluation](#match-rs-eval)
    * [1.3.1 Runtime Semantics: MatchClauseMatches](#match-rs-match-clause-matches)
    * [1.3.2 Runtime Semantics: MatchClauseEvaluation](#match-rs-match-clause-eval)
    * [1.3.3 Runtime Semantics: By Example](#match-rs-by-example)
* [Annex A: Design Decisions](#annex-a)
  * [No Clause Fallthrough](#no-fallthrough)
  * [Variables Always Assign](#variables-always-assign)
  * [`Object.is` for non-collection literals](#object-is-comparison)
  * [Only one match param](#only-one-param)
* [Annex B: Performance Considerations](#annex-b)
* [Annex C: Future Bikeshedding Concerns](#annex-c)
  * [C.1 `undefined` and Other "Literals"](#fake-literals)

## Introduction

This proposal adds a pattern matching statement to the language, based on the
existing [Destructuring Binding
Patterns](https://tc39.github.io/ecma262/#sec-destructuring-binding-patterns).
Pattern matching is a widely-applicable feature that often becomes core to the
way developers end up writing code logic, and This proposal draws heavily from
corresponding features in
[Rust](https://doc.rust-lang.org/1.6.0/book/patterns.html),
[F#](https://docs.microsoft.com/en-us/dotnet/fsharp/language-reference/pattern-matching),
[Scala](http://www.scala-lang.org/files/archive/spec/2.11/08-pattern-matching.html),
and [Elixir](https://elixir-lang.org/getting-started/pattern-matching.html).

## <a name="big-picture"></a> The Big Picture

A significant point about this is that it adds a fourth, though complimentary,
conditional syntax to the language, after `if`, `switch`, and `?:`.

The big addition here is that this proposal closely mirrors the semantics of
destructuring binding and destructuring assignment in most cases. Anyone who has
learned to use destructuring binding in either assignment or function arguments
should be able to apply that same understanding to match branches, and can
benefit from much richer and semantically concise conditionals.

This proposal is also a step towards improving the overall experiences of users
writing `class`-heavy code -- with the [Tagged Collection
Literals](https://github.com/zkat/proposal-collection-literals) extension, which was written with the
intention of benefitting from this proposal, users will have a much richer set
of features to construct, destruct, and otherwise manipulate their instances.

There are other proposals making similar efforts to improve manipulation and
access of built-in data structures as well: [Optional
Chaining](https://github.com/tc39/proposal-optional-chaining), for example, also
makes this sort of access (and operations on those values) easier. Likewise, the
proposed [Slice Notation](https://github.com/gsathya/proposal-slice-notation)
does something similar for Arrays.

This proposal doesn't just enrich the wealth of Object-orientation-related
features the language currently has (and is currently adding), but also fits in
nicely with proposals meant to develop JavaScript's capabilities as a
function-oriented language: [the Pipeline
Operator](https://github.com/tc39/proposal-pipeline-operator), for example,
would be able to use `match` statements as a terse, rich branching mechanism.

It's notable that this operator is specifically a statement, much like `if` and
`switch`. That means that it cannot itself return a value that can be assigned
into a variable. That makes it more procedural than a lot (most? all?) pattern
matching constructs in other language. It is the position of this proposal's
authors that the issue of treating such statements as expressions is best left
to the [`do` expression
proposal](https://github.com/tc39/proposal-do-expressions) and, more
importantly, [implicit `do`
expressions](https://github.com/tc39/proposal-do-expressions/issues/9), which
will complete their integration. Trying to make _only_ the `match` operator act
as an expression would introduce a lot of questions that are already being
discussed in the `do` proposal, which would need to be answered either way, such
as the behavior of `CompletionValue`s, the behavior of `continue`, `break`, and
`return` inside them, the behavior of `var` and `function` hoisting, etc. So, it
will benefit from a more focused discussion. In the meantime, a `match`
statement would still bring great benefit to users through its conditional
expressive ability.

In summary, I believe the `match` statement, specially with its proposed
extensions, would fit well into the current apparent direction of the language,
and it will benefit users who use JavaScript as a heavily Object-oriented
language as much as users who prefer to write it in a more Function-oriented
style. And they would be able to do all of this with an addition to the language
that requires relatively little additional overhead over skills and tools
they've already learned.

### <a name="related-proposals"></a> Related Active Proposals

These are proposals with either some logical overlap, or which are likely to be
used in conjunction with this proposal on a pretty regular basis (usually due to
how well they work together).

* [`as` patterns](https://github.com/zkat/proposal-as-patterns)
* [Tagged Collection Literals](https://github.com/zkat/proposal-collection-literals)
* [`do` expressions](https://github.com/tc39/proposal-do-expressions)
* [Optional Chaining](https://github.com/tc39/proposal-optional-chaining)
* [Pipeline Operator](https://github.com/tc39/proposal-pipeline-operator)
* [Block Params](https://github.com/samuelgoto/proposal-block-params)
* [Slice Notation](https://github.com/gsathya/proposal-slice-notation)
* [BigInt](https://github.com/tc39/proposal-bigint)
* [`throw` Expressions](https://github.com/rbuckton/proposal-throw-expressions)
* [Extensible numeric literals](https://github.com/tc39/proposal-extended-numeric-literals)

## <a name="match-statement"></a> 1 Match Statement

### <a name="match-syntax"></a> Syntax

```
Statement :
  MatchStatement

MatchStatement :
  // Note: this requires a cover grammar to handle ambiguity
  // between a call to a match function and the match expr.
  `match` [no |LineTerminator| here] `(` Expression `)` [no |LineTerminator| here] `{` MatchClauses `}`

MatchClauses :
  MatchClause
  MatchClauses MatchClause

MatchClause :
  `when` MatchPattern Initializer[opt] MatchGuard[opt] `~>` MatchClauseBody

MatchGuard :
  `if` `(` Expression `)`

MatchClauseBody :
  Statement

MatchPattern :
  ObjectMatchPattern
  ArrayMatchPattern
  IdentifierMatchPattern
  LiteralMatchPattern

ObjectMatchPattern :
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
  `...` IdentifierMatchPattern

ArrayMatchPattern :
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
  `...` IdentifierMatchPattern
  `...` MatchElement

IdentifierMatchPattern :
  BindingIdentifier

LiteralMatchPattern :
  NullLiteral
  BooleanLiteral
  NumericLiteral
  StringLiteral

AssignmentExpression :
BindingIdentifier :
BooleanLiteral :
Elision :
Expression :
Initializer :
LineTerminator :
NullLiteral :
NumericLiteral :
SingleNameBinding :
Statement :
StringLiteral :
  As Described in Ecma-262
```

### <a name="match-ss-errors"></a> 1.1 Static Semantics: Early Errors

TKTK

### <a name="match-rs-fn-def"></a> 1.2 Runtime Semantics: IsFunctionDefinition

TKTK

### <a name="match-rs-eval"></a> 1.3 Runtime Semantics: Evaluation

_MatchStatement_ `:` `match` `(` _Expression_ `)` `{` MatchClauses `}`

1. Let _exprRef_ be the result of evaluation _Expression_.
1. Let _exprValue_ be ? GetValue(_exprRef_)
1. For each element _MatchClause_ in _MatchClauses_:
  1. If no _MatchClause_ left, throw _MatchError_
  1. Let _matched_ be ? MatchClauseMatches(_exprValue_, _MatchClause_)
  1. If _matched_ is true, then
    1. Let _clauseCompletion_ be ? MatchClauseEvaluation(_exprValue_, _MatchClause_)
    1. Return Completion(UpdateEmpty(_clauseCompletion_, `undefined`))

#### <a name="match-rs-match-clause-matches"></a> 1.3.1 MatchClauseMatches(_exprValue_, _MatchClause_)

_MatchClause_ `:` `when` _MatchPattern_ _Initializer_[opt] _MatchGuard_[opt] `~>` _MatchClauseBody_

_MatchPattern_ `:` _ObjectMatchPattern_

_ObjectMatchPattern_ `:` `{` `}`

<!-- Note: I think this is the way to check if something's an object? -->
1. Perform ? ToObject(_exprValue_)
1. Return `true`

_ObjectMatchPattern_ `:` `{` _MatchRestProperty_ `}`

1. TODO

_ObjectMatchPattern_ `:` `{` _MatchProperty_ `}`

1. TODO

#### <a name="match-rs-match-clause-eval"></a> 1.3.2 MatchClauseEvaluation(_exprValue_, _MatchClause_)

1. TODO

#### <a name="match-rs-by-example"></a> 1.3.3 Runtime Semantics: By Example

Match logic:

```js
match (input) {
  when {x: 1} ~> ... // matches if `input` can do ToObject and `input.x` is 1
  when [1,2] ~> ... // matches if `input` can do GetIterator, has exactly 2 items, and the items are 1, then 2.
  when 1 ~> ... // matches if `input` is 1
  when 'foo' ~> ... // matches if `input` is 'foo'
  when false ~> ... // matches if `input` is `false`
  when null ~> ... // matches if `input` is `null`
  when {x} if (myCheck(x)) ~> ... // matches if `input` can do ToObject, if `input.x` is not `undefined`, and if `myCheck(input.x)` is true
  when x ~> ... // always matches
  when /^foo/ ~> ... // SyntaxError
  when x if (x.match(/^foo/)) ~> ... // ok!
}
```

Rest params:
```js
match (input) {
  when {x, ...y} ~> ... // binds all-other-properties to `y`.
  when {x, ...{y}} ~> ... // SyntaxError
  when [1, ...etc] ~> ...
  when [1, ...[2]] ~> ... // Recursive matching on `rest` is allowed
}
```

```js
while (true) {
  match (42) {
    when v ~> {
      var hoistMe = v
      const noHoist = v
      function alsoMe () { return v }
      if (v) { continue } // skips next line
      break // breaks out of the `while` loop
    }
    when y ~> function foo () {} // function statement, not function expression
  }
}
console.log(hoistMe) // 42 -- variables are hoisted as in `if`
console.log(alsoMe()) // 42 -- so are functions
console.log(foo) // non-block function syntax treated as _statement_
console.log(noHoist) // SyntaxError -- `const`/`let` are block-scoped
```

Initializers:
```js
match (input) {
  // matches `input` if it's an object. If `input` is `undefined`, match is set
  // to `{x: 1}`, and x is bound to 1.
  when {x} = {x: 1} ~> ...
  // matches if `input` is an object, whether or not it has an `x` property, and
  // sets `x` to `1` if `x` does not already exist on the object. Does NOT
  // match if `input` is undefined.
  when {x: x = 1} ~> ...
  // initializers only execute if a match succeeds.
  // This example only matches if `status` was already 200 on input.
  when {status = 200} if (status === 200) ~> ...
  // And this one always succeeds if a status property existed, with any value,
  // and the initializer will never be executed (because the property was
  // defined already)
  when {status = 400} ~> ...
}
```

Pathological case: non-primitive built-in variables.
```js
match (input) {
  when Infinity ~> ... // always matches, sets a local `Infinity` to `input`
  when -Infinity ~> ... // SyntaxError: not a MatchPattern
  when undefined ~> ... // always matches, assigns `input` to local `undefined` var
  when NaN ~> ... // ditto. rip 💀
}
```

## Annex A: Design Decisions

These are key, intentional design desicions made by this proposal in particular
which I believe should stay as they are, and why:

### <a name="no-fallthrough"></a> > No Clause Fallthrough

As part of distancing this feature from `switch`, and focusing on semantics that
work best for it, fallthrough is not possible between multiple legs. It is
expected that match clause are complete enough for picking a single leg, and
further skipping can be done using guards or nested `match`.

```js
match (x) {
  when {x: 1, y} if (y <= 10) ~> ...
  when {x: 1} ~> ...
}
```

Probably the biggest advantage of preventing fallthroughs is that it clarifies
scoping so much, and prevents really complicated and footgun-y cases where
previous scopes might suddenly inject variables into further-down bodies:

```js
match (x) {
  when y if (y < 10) ~> {
    x = 10
    continue // prev proposal version used `continue` for explicit fallthrough
  }
  when y if (y >= 10) ~> {
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
arguments, which essentially makes them work like `let`.

```js
const y = 2
match (1) {
  when y ~> ... // y is 1, not 2
}
console.log(y) // 2
```

Guards can be used instead, for comparisons:

```js
const y = 2
match (1) {
  when y if (y === 2) ~> 'does not match',
  when x if (x === 1) ~> 'x is 1'
}
```

See also [the bikeshed about pinning](#variable-pinning-operator) for a proposal
on how to allow variable-based matching.

##### Benefits:

* Follows the precedent of almost every other match implementation I could find. This is about as universal as I think this gets? Swift is the only exception, requiring a `let` before a variable that's intended to be bound.
* Consistent behavior: No ambiguity when a variable is not assigned vs when it's suddenly assigned in the scope. Behavior will remain the same.
* Eliminates the need for an `else`/`default` leg, because assignment to any variable will be sufficient. JS programmers are already used to assigning variables that are then ignored (in functions, in particular), and different people have different tastes in what that should be. `_`, `other`, etc, would all be perfectly cromulent alternatives.

### <a name="object-is-comparison"></a> > Primitives compared with `Object.is`

This proposal special-cases Array, and Object literal matches to make them more
convenient and intuitive, but Numbers, Strings, Booleans, and Null are always
compared using `Object.is`:

```js
match (x) ~> {
  when 1 ~> // x is 1
  when 'foo' ~> // x is 'foo'
  when null ~> // x is null (NOT undefined)
}
```

See also [the bikeshed about special-casing the `null` matcher](#null-punning),
as well as the one [about making `undefined` another "primitive"
matcher](#undefined-match).

#### <a name="only-one-param"></a> > Only one parameter to match against

`match` accepts only a single argument to match against. This is sufficient,
since arrays can be used with minimal syntactic overhead to achieve this effect:

```js
match ([x, y]) {
  when [1, 2] ~> ...
}
```

(versus `match (x, y) ...`)

## <a name="annex-b"></a> Annex B: Performance Considerations

The general design of this `match` leans heavily towards hopefully allowing
compiler-side optimizations. By minimizing runtime generation of matching logic,
many match clauses can potentially be filtered according to PIC status
(monomorphic/polymorphic/etc), as well as by Map/type. A sufficiently smart
compiler should be able to reorder and omit branches and possibly reduce certain
simpler match expressions to what a low-level `switch` might be.

The fact that variable matchers do not need to match against variables in
surrounding scopes, and worry about their internal types, is probably also a big
advantage -- variable bindings are simply typed the same as the corresponding
value passed into `match` (again, optimized with PICs).

Complex compounds might also cause issues (`&&`/`||`), but these can be
optimized if all clauses have identical-typed matchers (`1 || 2 || 3 ~> ...`).

I'm not a browser engine implementer, though, so I'm probably way off base with
what would actually have an impact on performance, but I figured I should write
a bit about this anyway.

## <a name="annex-c"></a> Annex C: Future Bikeshedding Concerns

This section documents issues that have been raised against the design,
and don't need to be resolved right now at this early stage,
but will probably need to be resolved in order for this to progress to later stages.

## <a name="fake-literals"></a> `undefined` and Other "Literals"

(Documented in [Issue 76](https://github.com/tc39/proposal-pattern-matching/issues/76).)

Earlier in this document there's an example of some pathological behavior
for things that aren't actually syntax literals,
but which most authors treat as if they are:

```js
match (input) {
  Infinity ~> ... // always matches, sets a local `Infinity` to `input`
  -Infinity ~> ... // SyntaxError: not a MatchPattern
  undefined ~> ... // always matches, assigns `input` to local `undefined` var
  NaN ~> ... // ditto. rip 💀
}
```

All of these cases should probably be special-cased in the matching syntax
to refer to their global values,
rather than treated as always-matching assignment clauses
(or syntax errors, in `-Infinity`'s case),
or else they'll likely end up being footguns for authors.

(They *can* still be matched regardless, using an `if` clause to manually test
for the value. This is just concerning the ergonomics and expected behavior of
using them directly as a matcher.)
