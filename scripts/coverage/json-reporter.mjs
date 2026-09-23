/** Standard public Node test-reporter protocol; no private V8 or Node internals. */
export default async function* report(source) {
  for await (const event of source) {
    if (event.type === 'test:coverage') {
      yield JSON.stringify(event.data.summary, null, 2) + '\n';
    }
  }
}
