# ECMAScript Tagged Collection Literals

## [Status](https://tc39.github.io/process-document/)

**Stage**: 0

**Author**: Kat Marchán (npm, [@maybekatz](https://twitter.com/maybekatz))

**Champions**: Kat Marchán (npm, [@maybekatz](https://twitter.com/maybekatz))

## Introduction

This proposal extends both destructuring binding/assignment and the [`match`
operator](https://github.com/tc39/proposal-pattern-matching) with the ability to
apply custom destructuring and matching operations to matched data. It also adds
a new constructor syntax for building these custom data structures with concise
object and array style syntax while preserving their individual benefits and
invariants.

The syntax itself is derived from similar syntax in multiple other languages
used for this purpose, and is meant to be reminiscent of tagged template
literals -- except using other literal syntaxes available in the language.

When applied to match operations, its functionality is based on [Scala's
"extractors" feature](https://docs.scala-lang.org/tour/extractor-objects.html).

Construction, destructuring, and matching are all done using a
`Symbol.tktk`-based protocol which used can implement for any data structure.

This proposal is derived from a previously-discussed [extensible collection
literals](https://github.com/alex-weej/es-extensible-collection-literal), but
adds significant work as far as how this syntax interacts with destructuring and
matching.

## Motivating Examples

Convenient construction of object-like and array-like data structures:
```js
const map = Map#{1: 2, three: 4, [[5]]: 6, 1: 'again'}
// Map { 1 => 'again', 'three' => 4, [5] => 6 }

const set = Set#[1,2,3,2]
// Set [1, 2, 3]

const opt = Some#1
// Some { value: 1 }
```

Destructuring assignment/binding:
```js
const Map#{1: x, three: y} = map
x // 2
y // 4

const Set#[x,y] = set
x // 1
y // 2

const Some#x = opt
x // 1
```

Match Operator compatibility:
```js
match (input) {
  Map#{1: x, 2: y} => ...,
  /(?<year>\d{4})-(?<month>\d{2})/u#{groups: {year, month}} => {
    `The year is ${year}, and the month is ${month}`
  },
  // So I heard u liek monadz
  Some#1 => `option succeeded with an internal value of 1`
  Some#x => `option succeeded with a non-1 value of ${x}`,
  None#{} => `option failed`
}
```

## The Big Picture

### Related Active Proposals

* [Private accessors](https://github.com/tc39/proposal-private-methods) (due to `#` syntax)
* [Frozen/sealed object syntax](https://github.com/keithamus/object-freeze-seal-syntax)
* [Richer Keys](https://docs.google.com/presentation/d/1q3CGeXqskL1gHTATH_VE9Dhj0VGTIAOzJ1cR0dYqDBk/edit#slide=id.p)
* [`Object.fromEntries`](https://github.com/bakkot/object-from-entries)
* [Smart Pipelines](https://github.com/js-choi/proposal-smart-pipelines/blob/master/readme.md)
* [`of` and `from` constructors](https://github.com/tc39/proposal-setmap-offrom)

## Construction Literals

For construction, literals are a thin layer of syntax sugar over `new`
expressions. When a literal construction expression is found, the left hand side
is evaluated for its value, and the right hand side is converted to an iterator
or an atomic value:

```js
// Tagged Object Literals
Map#{foo: 1, 'foo': 1, [Symbol('bar')]: 2, 3: 4, [{}]: 5}
=== new Map({[Symbol.iterator]: function* () {
  // IdentifierName interpreted as string
  yield ['foo', 1]
  // StringLiteral PropertyNames
  yield ['foo', 1]
  // Symbols preserved
  yield [Symbol('bar'), 2]
  // Numeric literals do not get ToString
  yield [3, 4]
  // Other kinds of computer property also do not get ToString
  yield [{}, 5]
}}

// Tagged Array Literals
Set#[1,2,3]
=== new Set({[Symbol.iterator]: function* () {
  // Nothing special here, except the argument is not an Array
  yield 1; yield 2; yield 3
}})

// Tagged Value Literals
Some#1
=== new Some(1)
```

### Benefits

For Objects, the benefits are more obvious: No conversion to `ToString`,
parse-time early errors for invalid key/value syntax, and more appropriate
syntax for key/value types, instead of having to write nested arrays.

For Arrays and Values, the benefit on this end of things is smaller, and largely
based on convenience, with the exception that it does help ease a common footgun
with `new`:

```js
class Bar { constructor (iter) { this.val = [...iter] } }
function foo () { return {Bar} }
foo.Bar = Bar
new foo().Bar()
// TypeError: Class constructor Bar cannot be invoked without `new`
new foo.Bar()
// => Bar {}
```

While this behavior is consistent, it is something that does occasionally bite
people. Literal syntax helps ease this a bit, specially in data structure-heavy
code:

```js
foo().Bar#[1,2,3]
Bar { val: [1,2,3] }
foo.Bar#[1,2,3]
Bar { val: [1,2,3] }
```

But, as implied before, the main benefit of extending tagged literal syntax to
arrays and individual values is the correspondence to destructuring...

## Destructuring Literals

When a user learns they can construct with one syntax, is becomes much easier to
teach them how to destruct with it.

While the standard `new`/`constructor` mechanism is what makes construction
literals work, destructuring uses the standard iterator protocol through a
`Symbol.entries` method. If `Symbol.entries` is not present, `.entries()` is
tried instead. If specific keys are being requested, `.entries()` will receive
an array of keys that are being requested from the object. Filtering entries
based on these keys is optional.

```js
const Map#{1: x, y} = Map#{1: 'x', y: 'y'}
===
let x, y
for (let entry of Map#{1: 'x', y: 'y'}.entries([1, 'y'])) {
  match (entry) {
    [1, _x] => { x = _x },
    ['y', _y] => { y = _y }
  }
}

const Set#[a, b, c] = Set#[1,2,3,4]
===
let [a,b,c] = Array.from(Set#[1,2,3,4].entries()) // requests all entries

class Some {
  constructor (val) { this._val = val }
  [Symbol.entries] () { return this._val }
}
const Some#x = Some#1
===
let x = (Some#1).entries()
// x === 1
```

When a destructuring sequence is used, the iterator will be used as-is to match
and fill entries in the destructured array. When a single value is requested,
destructuring will use the first value from the iterator.

If no iterator is returned, destructuring is considered to have failed. When
using destructuring binding, this will just make all requested variables stay
uninitialized. If matching, it will cause the match to fail.
