# ECMAScript Pattern Matching Syntax
Stage 0 Proposal<br>
Champions: Brian Terlson (Microsoft, [@bterlson](https://twitter.com/bterlson)), Sebastian Markbåge (Facebook, [@sebmarkbage](https://twitter.com/sebmarkbage))

```js
let length = vector => match (vector) {
    { x, y, z}: Math.sqrt(x ** 2 + y ** 2 + z ** 2),
    { x, y }:   Math.sqrt(x ** 2 + y ** 2),
    [...]:      vector.length,
    else: {
        throw new Error("Unknown vector type");
    }
}
```

Pattern matching is a way to select behaviors based on the structure of a value in a similar way to destructuring. For example, you can trivially match objects with certain properties and bind the values of those properties in the match leg. Pattern matching enables very terse and highly readable functional patterns and is found in a number of languages. This proposal draws heavy inspiration from [Rust](https://doc.rust-lang.org/1.6.0/book/patterns.html) and [F#](https://docs.microsoft.com/en-us/dotnet/fsharp/language-reference/pattern-matching).

This proposal is stage 0 and as such is open to significant revision. Any and all feedback and ideas are greatly appreciated. Use the issues to post questions/ideas and send pull requests for any content updates. Fixes, clarifications, and especially usage examples are definitely helpful.

## Syntax Sketch
```
Expression :
  MatchExpression
  
MatchExpression :
  `match` [no |LineTerminator| here] `(` Expression `)` [no |LineTerminator| here] `{` MatchExpressionClauses `}`
  // Note: this requires a cover grammar to handle ambiguity
  // between a call to a match function and the match expr.

MatchExpressionClauses : 
  MatchExpressionClause
  MatchExpressionsClauses `,` MatchExpressionsClause
  
  // MatchExpressionClauses are evaluated in order until one
  // evaluates to a truthy value.
  
MatchExpressionClause :
  MatchExpressionPattern `:` Expression
  
MatchExpressionPattern :
  ObjectMatchPattern
  ArrayMatchPattern
  IdentifierMatchPattern
  LiteralMatchPattern
  `else`

  
ObjectMatchPattern :
  // Basically ObjectBindingPattern with with optional rest element
  // binding
  
ArrayMatchPattern :
  // Basically ArrayBindingPattern with optional rest element binding
  
IdentifierMatchPattern :
  // Any binding identifier

LiteralMatchPattern :
  // number, string, boolean, null, or undefined literal
```

The syntax of object and array patterns deliberately hews closely to destructuring which is advantageous for a couple reasons. First, it aligns with existing syntax that developers are familiar with. Second, it allows pattern matching and destructuring to be used in similar contexts (for example, future proposals for multi-methods or the like). However, pattern matching JavaScript values requires in practice requires more expressive power than simple destructuring gives us. This proposal adds additional patterns to fill the gaps. It may be reasonable to depart further from destructuring to increase the utility and expressiveness of this proposal (e.g. something like #17).

## Object Patterns
Object patterns match objects with certain properties. Additional properties may be present on the matched object. Examples:

```js
match (obj) {
    { x }: /* match an object with x */,
    { x, ... y }: /* match an object with x, stuff any remaining properties in y */,
    { x: [] }: /* match an object with an x property that is an empty array */,
    { x: 0, y: 0 }: /* match an object with x and y properties of 0 */
}
```

## Array Patterns
Array patterns match array-like objects (objects with a `length` property). A (possibly anonymous) rest is employed to allow matching on arrays of any length. Examples:

```js
match (arr) {
    []: /* match an empty array */,
    [...]: /* match any array */,
    [x]: /* match an array of length 1, bind its first element as x */,
    [x, ...]: /* match an array of at least length 1, bind its first element as x */,
    [ { x: 0, y: 0}, ... ]: /* match an array with the 2d origin as the first element */
}
```

It is possible that array patterns could also match iterables, however it's not clear this design is desirable. First, it's not clear that users of pattern matching would expect array patterns to match any object with Symbol.iterable. Second, since pulling values out of an iterable is side-effecty, it introduces a lot of confusion around what the state of the iterable is in each match leg and it's not clear that side-effecty-by-default pattern matching is a good idea.

That said, destructuring does work on iterables so there is a strong alignment argument here.

## Literal Patterns
Literal patterns are string, number, boolean, null, and undefined literals and matches exactly that value. Examples:

```js
match (val) {
    1: /* match the Number value 1 */,
    "hello": /* match the String value "hello" */,
}
```

## Identifier Patterns &amp; Symbol.matches

Identifiers are looked up for their runtime value. A value matches if it has a Symbol.matches method which returns something truthy when passed the value being matched (see also optional extensions below for a way to destructure the value returned from the Symbol.matches method).

This capability enables a few nice things. First, it allows for matching regular expressions. A RegExp pattern could be considered but regexps (especially complex ones) are not usually declared 'inline'.

Second, it allows for easy brand/instanceof checks - a type can implement its own Symbol.matches method that decides whether some value is a type of itself. A basic implementation might simply be `return value instanceof this.constructor`. Such a basic implementation could be created by default for types created via `class` keyword.

Third, and more generally, it creates a protocol around matching of values to eachother. This can be useful for future proposals, e.g. the `interface` proposal, to add things like e.g. nominal interface/tagged union discrimination.

```js
match (val) {
    someRegExp: /* val matches the regexp */,
    Array: /* val is an instance of an array */,
    CustomType: /* val is an instance (or something) of CustomType */,
    PointInterface: /* perhaps a tagged union of some sort */
}
```

## Further examples

### Nested Patterns
Patterns can nest. For example:

```js
let isVerbose = config => match (config) {
    {output: {verbose: true }}: true,
    else: false
}
```
The `true` in the pattern above may be any pattern (in this case it's a literal pattern).

### Nested Matching
Because match is an expression, you can match further in the consequent of a match leg. Consider:

```js
let node = {
    name: 'If',
    alternate: { name: 'Statement', value: ...},
    consequent: { name: 'Statement', value: ... }
}

match (node) {
    { name: 'If', alternate }: // if with no else
        match (alternate) {
            // ...
        },
    { name: 'If', consequent }: // if with an else
        match(consequent) {
            // ...
        }
}
```
## Design Goals &amp; Alternatives

### No fall-through
Fall-through can be requested via the `continue` keyword. It is a runtime error if no patterns are matched.

### Statement vs. Expression
Having `match` be a statement would align very closely with `switch` clauses. However alignment with `switch` could be problematic as the legs will likely behave differently. Using `switch` as a mental model for `match` will help but will not tell the entire story.

There is also no strong reason for this syntax to be statement-only. The difficulty of parsing exists in either context and statement-only `match` will limit its utility. On the other hand, expression forms of `match` are handy everywhere, especially as the body of an arrow function.

### Match Leg Statement Syntax
There are many options for the syntax of the match body. Broadly they are: case-like, arrow-function-like, and expression-only.

####  Case-like legs
Case-like legs contain statements. The consequent of a leg is executed statement-by-statement until a control flow keyword is encountered (or the end of the case construct). Case-like legs are useful because they allow statements as children. `throw` statements are commonly used.

Case-like legs are difficult syntactically because you need a keyword to begin a case leg. Using `case` for this could be an obvious choice. Another contextual keyword would be difficult to get right but presumably possible.

Additionally, since the value of the `match` expression is the value of evaluating the first matched leg, users of pattern matching will have to understand completion value semantics which is not something JS developers think about usually.

Lastly, case-like legs get verbose in smaller uses of pattern matching.

#### Arrow-function-like legs
Arrow functions allow either an expression or an optional block. Applying this to our pattern matching syntax enables two nice features: terseness with optional expansion, and comma-separated legs. This alternative is used for all the examples above.

#### Expression-only legs
You could allow only an expression in a leg and rely on `do` expressions to provide statements. This seems slightly less user friendly than arrow-function-like legs.

### Else Leg Syntax
I've gone with `else` as it aligns with other areas of JavaScript, but you might prefer something more terse like `_` (especially if you're used to F#). `_` also has the advantage of binding a value enabling you to reference a value in a guaranteed non-sideeffecty way. Consider:

```js
let obj = {
    get x() { /* calculate many things */ }
}
match (obj.x) {
    //...
    else: obj.x // recalculates.
}

match (obj.x) {
    // ...
    _: _ // the result of evaluluating obj.x is bound as _ and returned
}
```

## Optional Extensions

### Object & Array Pattern Value Matching
Array patterns could be extended to take a value allowing for matching properties or elements of a particular value using any binary operator. For example:

```js
// points can't have an x or y greater than 100
let outOfBoundsPoint = p => match (p) {
    { x > 100, y }: true,
    { x, y > 100 }: true,
    else: false
}
```

### If predicates
It is often handy to do some arbitrary tests on the value you are trying to match in the context of a match leg. For example:

```js
match (p) {
    {x, y} if x === y: true,
    else: false
};
```

### Destructuring of Runtime Match
It can be helpful to allow destructuring of runtime matching especially for RegExp matches. Consider:

```js
let nums = /(\d)(\d)(\d)/;
let lets = /(\w)(\w)(\w)/;
let str = '123';
match (str) {
    nums -> [,first, second, third]: first + second + third,
    lets -> [,first, second, third]: first + second + third
}
```

Symbol.matches of the RegExp objects are invoked and if the match succeeds, the match object is returned. The match object can be further destructured via the `->` clause.

### Multiple Patterns

Sometimes matching multiple patterns is useful. This can be allowed with enabling `||` to separate patterns (similar to Rust and F#). You could also allow `&&` to require that a value matches multiple patterns.

### Objects 'closed' by default

In the proposal above, additional properties on the object are allowed whereas arrays of a longer length are not unless explicitly matched with a `rest` parameter. The same could be applied to objects where `{x}` would only match an object with a single property named x whereas `{x, ... }` would match any object with an x property. However the predominant use case for matching objects likely doesn't care about additional properties, and it being common to augment objects with additional metadata in underscore properties or symbol keys, the proposed semantics seems fine (and of course linters can enforce this being explicit if they wish).

### Array pattern matches iterables

In the proposal above, array patterns work only on array-like objects with a `length` property. It could be extended to work on any iterable, but care would have to be taken to avoid side effects and iterating through the iterable multiple times as you move through the match legs.

### No parens around match value

A cover grammar could be avoided (I think) by departing even further from `switch` syntax and omitting the parens around the `match` value:

```js
match val {
    // ...
}
```

This removes the ambiguity with a call to a function named `match`.

### Built-in Symbol.matches implementations

Symbol.matches could be implemented on a number of built-in types, e.g. Number and String, which match values of that type. Additionally, classes could create the Symbol.matches method that does an `instanceof` check for you.
