# ConsentFlow

ConsentFlow is a lightweight JavaScript consent SDK for websites. It provides a cookie consent banner, preference modal, local consent storage, and simple script blocking through a single script tag.

## Why use it

- Fast: vanilla JavaScript, no framework dependency.
- Simple: install with one script tag.
- UX-friendly: avoids repeated interruptions for returning users.
- Practical: supports accept, reject, preferences, hooks, and blocked script activation.

## Install

```html
<script src="https://devpreeti.github.io/consentflow/consentflow.min.js"></script>
<script>
  ConsentFlow.init();
</script>
```

Queue-based initialization is also supported if you want to configure ConsentFlow before the SDK loads:

```html
<script>
  window.ConsentFlowQ = window.ConsentFlowQ || [];
  window.ConsentFlowQ.push(['init', {
    primaryColor: '#0ea5a4',
    theme: 'light',
    position: 'bottom'
  }]);
</script>
<script src="https://devpreeti.github.io/consentflow/consentflow.min.js"></script>
```

## Basic usage

```js
ConsentFlow.init();

ConsentFlow.acceptAll();
ConsentFlow.rejectAll();

ConsentFlow.savePreferences({
  analytics: true,
  marketing: false
});

const consent = ConsentFlow.getConsent();
console.log(consent);
```

Example consent object:

```js
{
  necessary: true,
  analytics: true,
  marketing: false,
  status: 'custom',
  updatedAt: '2026-04-10T10:00:00.000Z'
}
```

## API methods

- `ConsentFlow.init(options = {})`: initializes the SDK.
- `ConsentFlow.acceptAll()`: enables all supported consent categories.
- `ConsentFlow.rejectAll()`: disables optional categories and keeps `necessary` enabled.
- `ConsentFlow.savePreferences(preferences)`: saves selected categories.
- `ConsentFlow.getConsent()`: returns the current consent object.
- `ConsentFlow.hasConsent(category)`: returns whether a category is allowed.
- `ConsentFlow.reset()`: clears stored consent and returns to first-time state.
- `ConsentFlow.openPreferences()`: opens the preferences modal.

Backward-compatible helpers:

- `ConsentFlow.open()`: deprecated alias for `openPreferences()`.
- `ConsentFlow.activateScripts(category)`: manually activates blocked scripts for a category when consent allows it.

## Hooks

Hooks are optional and can be passed to `init()`.

```js
ConsentFlow.init({
  onInit: (consent) => console.log('Initialized', consent),
  onAccept: (consent) => console.log('Accepted', consent),
  onReject: (consent) => console.log('Rejected', consent),
  onChange: (consent) => console.log('Changed', consent)
});
```

Hook timing:

- `onInit`: after ConsentFlow initializes and reads stored consent.
- `onAccept`: after `acceptAll()`.
- `onReject`: after `rejectAll()`.
- `onChange`: after any consent change.

## Script blocking

Use `type="text/plain"` and `data-consent` to block scripts until consent is granted.

```html
<script type="text/plain" data-consent="analytics">
  console.log('Analytics loaded after consent');
</script>
```

External scripts are supported:

```html
<script
  type="text/plain"
  data-consent="analytics"
  src="https://example.com/analytics.js">
</script>
```

When analytics consent is granted, ConsentFlow automatically replaces the blocked script with a real `<script>` tag and runs it once. Developers do not need to call `activateScripts()` manually, though the method remains available for advanced integrations.

## Customization

```js
ConsentFlow.init({
  primaryColor: '#0ea5a4',
  theme: 'dark',
  position: 'bottom',
  labels: {
    acceptAll: 'Allow all',
    rejectAll: 'Reject',
    customize: 'Manage choices',
    savePreferences: 'Save choices'
  }
});
```

Supported categories:

- `necessary`: always enabled.
- `analytics`: optional.
- `marketing`: optional.
