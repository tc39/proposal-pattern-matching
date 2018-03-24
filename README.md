# ECMAScript Pattern Matching Syntax

#### Stage 0 Proposal

Champions: Brian Terlson (Microsoft, [@bterlson](https://twitter.com/bterlson)), Sebastian Markbåge (Facebook, [@sebmarkbage](https://twitter.com/sebmarkbage)), Kat Marchán (npm, [@maybekatz](https://twitter.com/maybekatz))

This proposal adds a new feature to ECMAScript, called "Pattern Matching",
through a new expression statement named `match`. Pattern matching is a feature
in some languages that allows different condition branches to run based on the
"shape" of the value passed in, and provides a very concise syntax for picking
out individual bits from data structures when they match.

Please refer to the [Introduction to Pattern Matching](#introduction) for a
friendly intro to this feature, and to help understand all the things it can
make better and clearer for you!

This document includes a [detailed description of the `match` API](#api), as
well as conscious [design decisions](#design-decisions) that were made involving
various details. Further down, you can also fine a section on
[bikesheds](#bikesheds) to discuss -- that is, technical decisions that are yet
to be made which have several different options where none of the options are
clearly the best choice. There's even a section on [future ideas related to this
spec](#to-infinity-and-beyond), which should be considered out of scope for this
proposal, but are worth mentioning anyway.

This proposal draws heavy inspiration from
[Rust](https://doc.rust-lang.org/1.6.0/book/patterns.html),
[F#](https://docs.microsoft.com/en-us/dotnet/fsharp/language-reference/pattern-matching),
[Scala](http://www.scala-lang.org/files/archive/spec/2.11/08-pattern-matching.html),
and [Elixir](https://elixir-lang.org/getting-started/pattern-matching.html).

A plain old javascript mock implementation is [available on
npm](https://npm.im/pattycake), with Babel and TypeScript support coming soon.

## Table of Contents

* [Motivating Examples](#examples)
* [Introduction to Pattern Matching](#introduction)
* [API](#api)
  * [`match`](#match)
  * [variables](#variable-matcher)
  * [primitives](#primitive-matcher)
  * [objects](#object-matcher)
  * [arrays](#array-matcher)
  * [regexp](#regexp-matcher)
  * [`||` and `&&`](#compound-matcher)
  * [Extractors](#extractors)
* [Design Decisions](#design-decisions)
  * [Syntax](#syntax-sketch)
  * [No Clause Fallthrough](#no-fallthrough)
  * [Variables Always Assign](#variables-always-assign)
  * [Fat arrow-style bodies](#fat-arrow-bodies)
  * [Joining Clauses with `&&` and `||`](#and-or-compounds)
  * [Performance](#performance)
* [Bikesheds](#bikesheds)
  * [Matcher method symbols](#method-symbols)
  * [`undefined` matching](#undefined-match)
  * [`null` punning](#null-punning)
  * [Match value assignment](#match-assignment)
  * [Variable pinning operator](#variable-pinning-operator)
  * [Unbound array rest parameters](#unbound-array-rest)
  * [`patternMatch` protocol](#pattern-match-protocol)
* [Beyond This Spec](#to-infinity-and-beyond)
  * [`catch` matching](#catch-match)
  * [`if match`](#if-match)
  * [`async match`](#async-match)
  * [Match Arrow functions](#match-arrow)

### <a name="examples"></a> Motivating Examples

Easily matching request responses:

```javascript
const val = match (await fetch(jsonService)) {
  {status: 200, {headers: {'Content-Length': s}}} => `Response size is ${s}`,
  {status: 404} => 'JSON not found',
  res@{status} if (status >= 400) => throw new RequestError(res)
}
```

Terser, more functional handling of Redux reducers. Compare with [this same
example in the Redux
documentation](https://redux.js.org/basics/reducers#splitting-reducers):

```js
function todoApp (state = initialState, action) {
  const newState = match (action) {
    {type: 'set-visibility-filter', filter: visFilter} => ({visFilter}),

    {type: 'add-todo', text} => ({
      todos: [...state.todos, {text}]
    }),

    {type: 'toggle-todo', index} => ({
      todos: state.todos.map((todo, idx) => idx === index
        ? Object.assign({}, todo, {done: !todo.done})
        : todo
      )
    }),

    {type} => throw new UnknownActionError(type)
  })

  return Object.assign({}, state, newState)
}
```

Or mixed in with JSX code for quick props handling:

(via [Divjot Singh](https://twitter.com/bogas04/status/977499729557839873))
```js
<Fetch url={API_URL}>{
  props => match (props) {
    {loading} => <Loading />,
    {error} => <Error error={error} />,
    {data} => <Page data={data} />
  }
}
</Fetch>
```

### <a name="introduction"></a> Introduction to Pattern Matching

Pattern matching is the name of a feature present in a variety of programming
languages, that allows you to write really concise comparisons for input values,
and then use that same syntax to pick out the individual bits you want to use,
then run some code specific to that match.

You can think of pattern matching as a more advanced form of `if` or `switch`
statements. In this example, `match` will return the value to the right of the `=>`
if the value on the left is equal to `num`:

```js
match (num) {
  1 => 'num is 1',
  2 => 'num is 2',
  'three' => 'num is "three"'
}
```

Compare this to the same thing with `if`:

```js
if (num === 1) {
  return 'num is 1'
} else if (num === 2) {
  return 'num is 2'
} else if (num === 'three') {
  return 'num is "three"'
}
```

Where pattern matching really shines, though, is its in ability to, well...
_match_ more complex _patterns_ of values. In the following example, instead of
using numbers or strings to the left of the `=>`, we use an ["object
matcher"](#object-matcher) to run different code depending on the value of
`response.status`.

```js
const response = await fetch(someUrl)
console.log(match (await fetch(someUrl)) {
  {status: 200} => 'request succeeded!',
  {status: 404} => 'no value at url!',
  // `response.status` can be assigned to a variable easily:
  {status} if (status >= 400) => `unknown request status: ${status}`
})
```

If we were to write the above with `if`, it would be something like:

```js
const response = await fetch(someUrl)
if (response.status === 200) {
  console.log('request succeeded!')
} else if (response.status === 404) {
  console.log('no value at url!')
} else if (response.status >= 400) {
  console.log(`unknown request status: ${response.status}`)
}
```

This `match` proposal doesn't just support [strings, number](#primitive-matcher)
and [objects](#object-matcher) in its comparisons, but also
[Arrays](#array-matcher), [other primitives like `null` and
booleans](#primitive-matcher), and even [regular expressions](#regexp-matcher).
You can even use something called an ["extractor"](#extractors) to customize
match clauses with more advanced matching features!

In summary, pattern matching is a way to abstract away long chains of `if` or
`switch` statements into comparisons based on the "shape" of the values you're
comparing against. Languages that support pattern matching tend to use it very
heavily, as it enables a lot of programming style patterns that tend to be much
more clunky or verbose with plain `if` or `switch` comparisons.

### API

#### <a name="match"></a> > `match (val) { [clauses]* }`

The `match` expression compares `val` against a number of comma-separated
clauses in the order they are defined, and executes the body to the right of the
arrow for the clause that succeeds, returning its final value.

If all clauses fail to match, a `MatchError` is thrown. To prevent this, use a
[fallthrough variable matcher](#variable-matcher) as the last clause.

There are 7 types of clauses: primitives, RegExp, Object, Array, `||`, `&&`, and
variable. Each of these clauses, except `||` and `&&`, can include a [custom
extractor](#extractors).

Composite clauses are able to further destructure and match their input, and the
top level clause can include a guard expression to further filter individual
clauses.

The final clause in a match expression can optionally be followed by a trailing `,`.

```js
const getLength = vector => match (vector) {
    { x, y, z } => Math.sqrt(x ** 2 + y ** 2 + z ** 2),
    { x, y } => Math.sqrt(x ** 2 + y ** 2),
    [...etc] => vector.length,
    _: { throw new Error("Unknown vector type") }
}
getLength({x: 1, y: 2, z: 3}) // 3.74165
```

#### <a name="variable-matcher"></a> > Variables

Plain variables in a `match` will be bound to their associated value and made
available to the body of that clause. If the variable is already bound in the
surrounding scope, it will be shadowed. Values inside variables are never
matched against directly -- use a guard instead.

##### Example

```js
const y = 2
match (1) {
  y => y === 1 // `const y` shadowed
}

match (2) {
  x if (x === y) => x === y && x === 2 // guard comparison with variable
}
```

#### <a name="primitive-matcher"></a> > Primitives

Primitive types will be matched with `===`. The following literals can be
matched against: `Number`, `String`, `Boolean`, `Null`.

##### Example

```js
match (x) {
  1 => ...,
  'foo' => ...,
  true => ...,
  null => ...,
  {x: true, y: 1, z: true} => ...
}
```

#### <a name="object-matcher"></a> > Objects

Objects are destructured. Any variables mentioned in the match side MUST exist
in the matched object, but additional properties on the object will be ignored.
Matches within objects can be further nested with any other types.

Object matchers support "rest params", that is, `{x, ...y}`. Unlike Array
matchers, though, it is a `SyntaxError` to try to further destructure that rest
param -- there is no real reason to do so, and this is also how current
destructuring works.

##### Example

```js
match (x) {
  {x: 1, y} => ..., // the y property is required, and is locally bound to y
  {} => ..., // matches any object
  {x: {y: 1}} => ...,
  {x, ...y} => ..., // binds all-other-properties to `y`.
  {x, ...{y}} => ..., // SyntaxError
  Foo {y} => ...,// matches an instance of `Foo` or, if
                 // `Foo[Symbol.patternMatch]` is present, that method is called
                 // instead. y is destructured out of the `Foo` object if the
                 // property exists.
}
```

#### <a name="array-matcher"></a> > Arrays

Array values are matched individually, just like with [Object
matchers](#object-matcher). The array length must match, unless a rest param is
used (`[1, 2, ...etc]`), in which case the array must be at least as long as the
number of entries before the rest param.

Array destructuring supports using a custom matcher, just like Objects. When
using custom matchers, the value is destructures as an `Array-like` object, so
it doesn't need to be a subclass of `Array` -- the `length` property will be
used for destructuring, along with any numerical keys.

Arbitrary [extractors](#extractors) can be used with Array matchers, as long as
they return Array-like values.

See also: [bikeshed on array rest params](#unbound-array-rest).

##### Example

```js
match (x) {
  [a, b, 1] => ...,
  [1, 2, null] => ...,
  [1, ...etc] => ...,
  [1, ...[2]] => ..., // Recursive matching on `rest` is allowed
  Foo [1, 2] => ...,
}
```

#### <a name="regexp-matcher"></a> > RegExp

Regular expression matchers are executed against the incoming value and the
match value made available for further destructuring, with Array or Object
matchers.

##### Example

```js
match (x) {
  /foo/ => ..., // x matched /foo/ just fine.
  /foo(bar)/u [match, submatch] => ..., // array-destructuring for matches
  /(?<yyyy>\d{4})-(?<mm>\d{2})-(?<dd>\d{2})/u {
    groups: {yyyy, mm, dd}
  } => ... // object-destructuring for matches, using named regexp groups!
}
```

#### <a name="compound-matcher"></a> > `&&` and `||`

You can use `&&` and `||` between expressions at any level. Guards are not
included in these expressions, as there must be only one.

When multiple variable-binding clauses are present, all referenced variables
will be declared in the clause body, with variables in later cases shadowing
earlier ones when they overlap.

In the case of `||`, variables that are only present in a failed or unreached
match will be left `undefined`, and the successful clause will take precedent
over other bindings, since it's the only one that will actually bind values.

##### Example

```js
match (x) {
  1 || 2 || 3 => ...,
  [1, y] && {x: y} => ..., // Both `x` and `y` are bound to their matches values
  {a: 1, x} || {a: 2, y} => // Both `x` and `y` are declared.
                            // Only one of the two will be defined.
}
```

#### <a name="extractors"></a> > Extractors

Extractors allow extending the pattern matching agent by allowing users to
customize the values used for matching and destructuring in clauses. Extractors
can apply to any variable, regexp, object, or primitive matcher expression, but
not directly to `||` and `&&` groups.

Extractors use a well-known Symbol, `Symbol.patternMatch`, which can decide
whether or not a particular clause will match, and can further return an object
with a `Symbol.patternValue` property to override the object that will be passed
through to the matcher for further matching/destructuring.

They are based on [Scala's own extractor
feature](https://docs.scala-lang.org/tour/extractor-objects.html), which uses an
`unapply()` method that corresponds to `Symbol.patternMatch`.

If a function is used in an extractor position and it has no
`Symbol.patternMatch` method, an `instanceof` check will be done instead.

##### Example

```js
class Maybe {}

// A class without `Symbol.patternMatch` will use `instanceof`
class None extends Maybe {}

// Any object with a `Symbol.patternMatch` method can be used.
class Just extends Maybe {
  constructor (x) { this.x = x }
}
Just[Symbol.patternMatch] = function (val) {
  if (val instanceof Just) {
    return {[Symbol.patternMatch]: this.x}
  }
}

const CustomerID = {
  [Symbol.patternMatch] (val) {
    if (typeof val !== 'string') { return false }
    const name = val.split('--')[0]
    if (name) {
      // Custom value using `Symbol.patternValue`
      return {[Symbol.patternValue]: name}
    }
  }
}

match (option) {
  None {} => ..., // matches `new None()`
  Just x => ..., // matches `new Just(1)` with x === 1 from extraction
  CustomerID 'Alex' => ... // matches if `option` is like 'Alex--1234567'
}
```

### <a name="design-decisions"></a> Design Decisions

These are key, intentional design desicions made by this proposal in particular
which I believe should stay as they are, and why:

#### <a name="syntax-sketch"></a> > Syntax Sketch

```
Expression :
  MatchExpression

MatchExpression :
  // Note: this requires a cover grammar to handle ambiguity
  // between a call to a match function and the match expr.
  `match` [no |LineTerminator| here] `(` Expression `)` [no |LineTerminator| here] `{` MatchExpressionClauses `}`

MatchExpressionClauses :
  MatchExpressionClause
  MatchExpressionsClauses `,` MatchExpressionsClause [`,`]

MatchExpressionClause :
  MatchExpressionClauseLHS [MatchGuardExpression] `=>` ArrowBody

MatchExpressionClauseLHS :
  [MatchExtractorExpresson] MatchExpressionPattern

MatchGuardExpression :
  `if` [no |LineTerminator| here] `(` Expression `)`

MatchExpressionPattern :
  ObjectMatchPattern
  ArrayMatchPattern
  IdentifierMatchPattern
  LiteralMatchPattern

ObjectMatchPattern :
  `{` ObjectMatchKeyVal [`,`, ObjectMatchKeyVal ]* `}`

ObjectMatchKeyVal :
  Variable
  ObjectKey `:` MatchExressionClauseLHS
  // Unlike Arrays, object destructuring can _only_ be a variable.
  `...` Variable

ArrayMatchPattern :
  `[` ArrayMatchPatternElement [`,`, ArrayMatchPatternElement]* `]`

ArrayMatchPatternElement :
  MatchExpressionClauseLHS
  // NOTE: I'm not sure what-all array destructuring is actually -able- to
  //       destructure here.
  `...` MatchExpressionClauseLHS

IdentifierMatchPattern :
  Variable

LiteralMatchPattern :
  LiteralNumber
  LiteralString
  LiteralBoolean
  LiteralNull
  LiteralRegExp
```

#### <a name="no-fallthrough"></a> > No Clause Fallthrough

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

Other use-cases for "fallthrough" in `switch` can be achieved with [compound
matchers](#compound-matcher):

```js
switch (x) {
  case 'foo':
  case 'bar':
    doThing()
    break
  case 'baz':
    doOtherThing()
}
```

Can be rewritten with `match` as:

```js
match (x) {
  'foo' || 'bar' => doThing(),
  'baz' => doOtherThing()
}
```

#### <a name="variables-always-assign"></a> > Variables always assign

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

#### > Primitives compared with `===`

This proposal special-cases Array, Object, and RegExp literal matches to make
them more convenient and intuitive, but Numbers, Strings, Booleans, and Null are
always compared using `===`:

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

#### <a name="fat-arrow-bodies"></a> > `=>` for leg bodies

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

#### <a name="and-or-compounds"></a> > Use `||` and `&&` for joining

There was [some
discussion](https://github.com/tc39/proposal-pattern-matching/issues/7) about
different ways to join together multiple match patterns. This proposal picked `||`
for one-of, and `&&` for all-of matches:

```js
match (x) {
  1 || 2 || 3 || x if (x > 10) => '...',
  Bar {} && Foo {} => 'instanceof both Bar and Foo classes'
}
```

I believe this is better than `:` because, again, it distances itself more from
the very very different `switch` semantics, and also has a very clear symmetry
that allows `&&` to work just fine. It also fits with other pattern matching
engines that allow alternatives like this actually do. I don't believe this is
worth further bikeshedding.

#### <a name="performance"></a> > Performance considerations

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

##### TODO:

I think there's some potential performance benefits to be had depending on how
object and array matchers are specced such that they would not internally
require extra value consing. This might require a serious re-evaluation of the
mechanics for extractors, but maybe it can be made to work in non-extractor
cases easily enough.

### <a name="bikesheds"></a> Bikesheds

These are things that have different tradeoffs that are worth choosing between.
None of these options are strictly or clearly better than the other (imo), so
they're worth discussing and making executive choices about.

#### <a name="method-symbols"></a> > Matcher method symbols

The original proposal used `Symbol.match`, but [that is already a "well-known"
Symbol](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol#Well-known_symbols)
used with RegExps. It's best for us to find a better one.

This proposal uses `Symbol.patternMatch` and `Symbol.patternValue` for its
methods, but that's all open to bikeshedding.

See also the bikeshed on [the patternMatch protocol](#pattern-match-protocol).

```js
class One {
  [Symbol.patternMatch] (val) { val === 1 }
}

match (1) {
  One x => 'x is 1'
}
```

#### <a name="undefined-match"></a> > `undefined` matching

While `null` is an actual primitive literal, `undefined` is an immutable
property of the global object that happens to *contain* the undefined primitive
value (which is obtainable via `void 0`, etc). This means that `undefined` can be a regular
variable, and can thus potentially be assigned by match expressions. There are
thus two choices here that we could take as far as how `match` treats
`undefined` matches:

The "consistent" solution would be to keep variable semantics for `undefined`
and treat it like a regular variable. This means that using `undefined` in the
LHS of a match clause would bind _any value_ to that variable and make it
available for that leg:

```js
match (1) {
  undefined => 'always matches',
  1 => 'unreachable code'
}
```

This avoids any special cases in the matching rules, but a guard must be used
to actually test if the value is undefined.

The alternative is to have a bit of a special case for `undefined` so it's
always treated as referring to the undefined primitive value, and matches with
an `===` comparison, as the other primitive literals do:

```js
match (1) {
  undefined => 'nope',
  1 => 'matches === 1'
}
```

This special-casing avoids a confusing footgun that the "consistent" approach allows,
if authors assume that `undefined` refers to the primitive value, which they can
usually do without problem:

```js
// If `undefined` is treated as a variable:
match(1) {
  undefined => 'always matches, and now undefined is bound to 1 in this body :('
}
```

Another argument in favor of the special case is so, instead of [making `match`
automatically pun on `null` equality](null-punning), we can use `||` to do the equivalent of a
`foo == null`:

```js
var x
match (x) {
  null || undefined => 'yay'
}
```

#### <a name="null-punning"></a> > Automatic equality-punning for `null`

By default, non-Object, non-Array, non-RegExp literals are [matched using
`===`](triple-or-double-match). Assuming that remains the case, there's a
question of whether supporting what's often considered "the reasonable use for `==`"
is worth the cost of inconsistency here. That is, we might want `null` in the
LHS of a match clause to cause a `==` check, instead of a `===` check, which
would make `undefined` match, as well:

```js
match (undefined) {
  null => 'this matches'
}
```

On the other hand, this would make it confusing for people expecting a `===`
match for this sort of literal. The main alternative would be to use a guard:

```js
match (undefined) {
  x if (x == null) => 'this matches'
}
```

Or, alternatively, using `|` if [`undefined` is
special-cased](#undefined-matching).

#### <a name="match-assignment"></a> > Assigning matches to variables

If you have a nested match, particularly a nested one, it would be useful to be
able to bind those specific matches to a variable. There's a number of syntaxes
that can be used for this:

##### Option A: `as`

This syntax is [used by
F#](https://docs.microsoft.com/en-us/dotnet/fsharp/language-reference/pattern-matching). It's also reminiscent of `as` syntax in `import` statements, so there's some precedent in the language for this sort of binding (`import * as bar from './x.js'`)

```js
match (x) {
  {x: {y: 1} as x} => x.y === 1
}
```

##### Option B: `@`

This syntax seems to be by far the most common, and is used by
[Rust](https://doc.rust-lang.org/book/second-edition/ch18-03-pattern-syntax.html#-bindings),
[Haskell](https://en.wikibooks.org/wiki/Haskell/Pattern_matching#as-patterns),
[Scala](http://www.scala-lang.org/files/archive/spec/2.11/08-pattern-matching.html#pattern-binders).
Its main differences from `as` are that the variable goes before the match and `@`
is more terse -- specially since spaces aren't necessary.

```js
match (x) {
  {x: x@{y: 1}} => x.y === 1
}
```

Another benefit of using `@` is that it could allow folks to use an extractor
directly without needing to pair it with a matcher, because the `@` operator
could double-up as a matcher "tag":

```js
match (obj) {
  @Foo => 'Foo[Symbol.patternMatch](obj) executed!',
  _@Foo => '@Foo is a shorthand for this',
  Foo {} => 'the way you would do it otherwise',
  Foo _ => 'though this works, too'
}
```

In more "real-world" context:
```js
match (opt) {
  Foo x => ...,
  @None => 'nope',
  None {} => 'nope' // how you would usually do it.
}
```

##### Option C: `=`

I'm not sure this one would even work reasonably in JS, because `=` is already
used for defaults in destructuring, but I'm including this one for the sake of
completeness, because it's [what Erlang uses for
this](http://learnyousomeerlang.com/syntax-in-functions#highlighter_784541)

```js
match (x) {
  {x: x = {y: 1}} => x.y === 1
}
```

#### <a name="variable-pinning-operator"></a> > Pin operator

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
  ^y => 'x is 1',
  x if (x === y) => 'this is how you would do it otherwise'
}
```

A more compelling reason to have this terseness might be to allow matches on
`Symbol`s or other "constant"-like objects:

```js
import {FOO, BAR} from './constants.js'

match (x) {
  ^FOO => 'x was the FOO constant',
  ^BAR => 'x was the BAR constant'
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
  ByVal(c.FOO) x => 'got a FOO',
  ByVal(c.BAR) x => 'got a BAR'
}
```

This might be enough, and might even be a reason to consider a built-in version
of this extractor.

(Kat's opinion: we have terse enough guards that this seems useless. Elixir
benefits from it mostly because it relies heavily on pattern matching on
variable assignments, not just in its case statement. The JS version of this
would have limited utility.)

#### <a name="unbound-array-rest"></a> > Binding-less array rest

In ECMAScript, `var [a, b, ...rest] = arr` allows bindging of "the rest" of the
array into a variable. This syntax, though, requires that the "rest" value be
bound to a specific variable. That is, `[a, b, ...]` is invalid syntax.

The previous pattern matching proposal included syntax that allowed this to be
the case, but only inside the LHS of `match`. It's possible the syntax could be
added, but there's also a question of whether it's necessary, since variables in
this proposal are always bound, rather than used for arbitrary matchin as in the
previous proposal -- there's little use for allowing plain `...` params besides
not wanting to have an unbound variable. That is, `[a, b, ..._]` achieves
essentially the same thing `[a, b, ...]` does.

Should this syntax be added to this proposal as well?

#### <a name="pattern-match-protocol"></a> > `Symbol.patternMatch` protocol

Currently, this proposal uses two "Well-known Symbols": `Symbol.patternMatch`
and `Symbol.patternValue`. The intent of these is to emulate Scala's Extractor
protocol.

There is some awkwardness in the translation here: Scala expects an `Option`
object to be returned (a data type of `Some` or `None`), and uses the value
inside the `Some` as the "extracted" value. JavaScript has no widely-used
unambiguous Maybe protocol, so that leaves us with a few alternatives as far as
how to implement identical behavior.

I believe the general feature of having extractors, with the current user-side
syntax for invoking them, and the concept of a `Symbol.patternMatch` method on
extractor objects is the right thing, and this proposal should keep it, but
there are questions about how to handle the values returned by `patternMatch`:

##### Option A (current impl)

`match` looks for `Symbol.patternMatch` methods on the Extractor argument
associated with a match, and the match succeeds iff the return value of
`Symbol.patternMatch` is truthy. To do the equivalent of `Some(val)`, you would
instead use the `Symbol.patternValue` symbol to tag a key in an object that you
then return: `{[Symbol.patternValue]: val}`.

This version is a bit weird, requires an extra symbol to work effectively, and
involves consing on individual matches, which can cause a hit in performance.
The advantage of doing things this was is that you can extract `undefined`,
`null`, `false`, etc, as the value of a match without worrying about ambiguity
or `undefined`-punning, which can be a footgun.

```js
class Foo {
  [Symbol.patternMatch] (val) {
    if (val == null) {
      return {[Symbol.patternValue]: null} // `null` value extracted
    } else {
      false
    }
  }
}
```

##### Option B

Expect `Symbol.patternMatch` to return `undefined` when it fails, and treat all
other value types as a successful match -- including `false`, `null`, etc. This
can present a bit of a footgun for users authoring `Symbol.patternMatch`
methods, since they might expect that method to work off booleans.

The advantage of this way of doing things is that it feels a little more
JavaScript-y than `Maybe`-style operations, and requires no additional consing
up of objects with magic keys. It also eliminates the need for the
`Symbol.patternValue` symbol altogether, which might be nice.

An argument in favor of switching to this mode is that even though it can be a
bit of a footgun, writing custom extractors is likely not a super common thing
for users to do -- mostly reserved for library authors and such. But that's just
a hunch.

```js
class Foo {
  [Symbol.patternMatch] (val) {
    if (val === null) { return null } // null return treated as match success
    // undefined return prevents a match
  }
}
```

##### Option C

One way to possibly meet halfway is to pass a callback into
`Symbol.patternMatch` that can be called on a value that's intended as the
"extracted" value.

```js
class Foo {
  [Symbol.patternMatch] (val, extract) {
    // Calling `extract` is the only way for matches to succeed
    if (val === null) { return extract(val) }
  }
}
```

##### Option D

Similarly to Option C, the "magic constructor" could be stored in
`Symbol.patternMatch` itself, and defining successful matches as anything that
returns an object crafted by that function:

```js
class Foo {
  [Symbol.patternMatch] (val) {
    if (val == null) { return Symbol.patternMatch.match(val) }
  }
}
```

### <a name="to-infinity-and-beyond"></a> Beyond This Spec

These are some things I consider out of scope for this particular spec, but that
are compelling enough and related to pattern matching that they might be
interesting to pursue -- specially after this spec is further along or even
widely available.

#### <a name="catch-match"></a> > Destructuring matches on `catch`

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

#### <a name="if-match"></a> > `if match` Convenience Sugar

There are cases where `match` can be clunky or awkward, but the power of its
pattern match is still desired. This happens primarily when a `match` expression
has only a single non-trivial leg, usually with a fallthrough:

```js
match (opt) {
  Some x => console.log(`Got ${x}`),
  None => {}
}
```

In this case, one might use an `if match` form or similar:

```js
if match (opt: Some x) {
  console.log(`Got ${x}`)
}
```

I'm not even touching what the right syntax for this should be, but there's [a
nice Rust RFC](https://github.com/rust-lang/rfcs/pull/160) that explains the
feature, and it seems to be well-liked among Rust developers.

#### <a name="async-match"></a> > `async match () {}`

I'm not sure whether this would ever be necessary, but it's probably worth
mentioning anyway. It's probably a completely pointless idea.

#### <a name="match-arrow"></a> > Match Arrow functions

Because of the similarity between clause bodies and arrow functions, it might be
interesting to explore the idea of something like a "match arrow" function that
provides a concise syntax for a single-leg `match` expression:

```js
const unwrap = v => match (v) Some x => x
```

Possibly taking it even further and making a shorthand that automatically
creates an arrow:

```js
const unwrap = match (Some x) => x
unwrap(new Some('hello')) // 'hello'
unwrap(None) // MatchError
```
