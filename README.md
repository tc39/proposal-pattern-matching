# ECMAScript Pattern Matching

## [Status](https://tc39.github.io/process-document/)

**Stage**: 0

**Author**: Kat Marchán (npm, [@maybekatz](https://twitter.com/maybekatz))

**Champions**: Brian Terlson (Microsoft, [@bterlson](https://twitter.com/bterlson)), Sebastian Markbåge (Facebook, [@sebmarkbage](https://twitter.com/sebmarkbage)), Kat Marchán (npm, [@maybekatz](https://twitter.com/maybekatz))

## Introduction

This proposal adds a pattern matching expression to the language, based on the
existing [Destructuring Binding
Patterns](https://tc39.github.io/ecma262/#sec-destructuring-binding-patterns).

It's structured into multiple parts:

* The [core proposal for the `match` API](CORE.md), which is based directly on destructuring binding patterns.

* A proposal extending both `match` and regular destructuring with [`as` patterns](https://github.com/zkat/proposal-as-patterns), so patterns can both be matched and be assigned to identifiers.

* A proposal to add [tagged collection literals](https://github.com/zkat/proposal-collection-literals), both as construction literals, and as their corresponding destructuring patterns.

* A document including suggestions for [other future proposals](TO_INFINITY_AND_BEYOND.md), which are dependent on `match`, but do not directly affect the main behavior of the feature.

This proposal draws heavily from corresponding features in
[Rust](https://doc.rust-lang.org/1.6.0/book/patterns.html),
[F#](https://docs.microsoft.com/en-us/dotnet/fsharp/language-reference/pattern-matching),
[Scala](http://www.scala-lang.org/files/archive/spec/2.11/08-pattern-matching.html),
and [Elixir](https://elixir-lang.org/getting-started/pattern-matching.html).

## Motivating Examples

Matching `fetch()` responses:

```javascript
const res = await fetch(jsonService)
const val = match (res) {
  {status: 200, headers: {'Content-Length': s}} => `size is ${s}`,
  {status: 404} => 'JSON not found',
  {status} if (status >= 400) => throw new RequestError(res)
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
        ? {...todo, done: !todo.done}
        : todo
      )
    }),

    {} => null // ignore unknown actions
  })

  return {...state, ...newState}
}
```

Or mixed in with JSX code for quick props handling:

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
(via [Divjot Singh](https://twitter.com/bogas04/status/977499729557839873))

General structural duck-typing on an API for vector-likes:

```js
const getLength = vector => match (vector) {
  { x, y, z } => Math.sqrt(x ** 2 + y ** 2 + z ** 2),
  { x, y } => Math.sqrt(x ** 2 + y ** 2),
  [...etc] => vector.length
}
getLength({x: 1, y: 2, z: 3}) // 3.74165
```

## Implementations

* [`pattycake`](https://npm.im/pattycake) (pure JS, no syntax sugar)
* [Babel Plugin](https://github.com/babel/babel/pull/7633)
