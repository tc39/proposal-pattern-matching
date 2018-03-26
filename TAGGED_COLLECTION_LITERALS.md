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
