# Base UI for what Radix does not have

`src/components/ui/` now imports from two primitive libraries. Everything that
existed before this decision — dialog, select, switch, label, and the rest —
is `radix-ui`. `combobox.tsx` alone is `@base-ui/react`. That split is
deliberate and it is narrow:

**Base UI is used only where Radix has no primitive at all.** Where both
libraries offer the same component, the Radix one wins and stays. Nothing that
already works gets ported.

The occasion was the barang picker. Catat Penyesuaian and Penerimaan both
chose a barang from a plain `Select` over the school's whole inventory, which
is scrollable and nothing else — Radix's type-ahead matches from the first
character and forgets a second later, so a person who knows the barang is
called "Kertas HVS A4" still has to scroll to K and read. The fix is a
searchable list, and Radix has no such primitive: `@radix-ui/react-combobox`
does not exist, and `radix-ui@1.6.7` exports no Combobox, Autocomplete, or
Command. The gap is real, not a matter of taste.

`npx shadcn add combobox` against this project's `radix-vega` style resolves
to a component built on `@base-ui/react`, notwithstanding the `radix` in its
documentation URL — that segment names the style family, not the primitive
underneath.

## Considered options

**Hand-rolling the combobox on Radix `Popover`.** Popover is already
installed, so this keeps the dependency list at one primitive library, which
matches how sparse this project's `package.json` deliberately is — no form
library, no state library, `Pencarian` written by hand. Rejected because the
part that would be hand-written is the listbox: `aria-activedescendant`,
roving highlight, screen-reader announcement of the filtered count, and
type-to-filter that does not fight the popover's own key handling. That is the
part of a combobox that is genuinely hard, it is used daily by staff, and it
is exactly what a dependency should be bought for. Saving thirty kilobytes by
writing the accessibility layer ourselves is the wrong trade.

**Putting a filter field inside the existing Radix `Select`.** The smallest
diff on paper. Rejected because `Select` owns its keystrokes for its own
type-ahead and manages focus inside its content; a text input placed in
`SelectContent` fights the primitive rather than using it.

**Waiting for Radix to ship a combobox.** No timeline, and the picker is
unusable now.

## Consequences

Two primitive libraries means two sets of conventions in one folder —
`data-slot` vs Base UI's own attributes, `asChild` vs `render`, different
animation state attributes. A reader who has only seen `select.tsx` will find
`combobox.tsx` unfamiliar. The boundary rule above is what keeps that from
spreading: without it the second library grows one convenient component at a
time until both do the same jobs and neither wholly.

Radix `Dialog` traps focus inside its content, and Base UI portals its popup
to `<body>` by default — outside that trap. In `DialogForm` the effect is that
the combobox opens and then cannot be typed into, because the search field
never receives focus. `KotakCari` therefore portals into the surrounding
`[role="dialog"]` when it finds one, so the popup lands inside the trap. This
is the concrete cost of mixing two focus models, it is written down because
the symptom is baffling on first contact, and any future Base UI component
placed inside a Radix dialog will need the same treatment.

`ComboboxInput` as generated wraps `input-group`, which this project does not
have. It renders the project's own `Input` instead, and the search field lives
inside the popup rather than replacing the trigger — so the closed control
still looks like every `SelectTrigger` beside it. `ComboboxClear` lost its
only caller in that edit and is exported rather than deleted, to keep the file
close to what `shadcn` would regenerate.

ADR 0001 and ADR 0006 are untouched: this decision is entirely about the
browser and reaches no policy, function, or role.
