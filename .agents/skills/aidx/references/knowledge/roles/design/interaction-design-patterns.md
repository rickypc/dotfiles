# Interaction Design Patterns

## Purpose
Reusable solutions to common UI interaction problems. Applying established patterns reduces user learning curve and development effort.

## Ownership and Handoff

This document is the framework-neutral interaction reference. Use
`/frontend-design` to turn these patterns into an approved visual and
interaction definition, and use `/react` to implement that definition for
React or React Native. Use `/content-writer` when meaningful UI copy needs
research, drafting, or validation. Keep framework implementation details out of
this reference so its patterns remain reusable across UI technologies.

## Navigation Patterns

### Top Navigation Bar
- Best for: Applications with 3-7 top-level sections
- Include: Logo (home link), primary nav items, user menu, search
- On mobile: Collapse to hamburger menu or bottom tab bar

### Side Navigation
- Best for: Applications with many sections, deep hierarchies, or admin interfaces
- Collapsible to icons-only for more content space
- Active section should be visually highlighted
- Support nested items with expand/collapse

### Breadcrumbs
- Best for: Deep hierarchies (e-commerce, file systems, documentation)
- Show the path from root to current page
- Each segment is a clickable link except the current page
- Do not use breadcrumbs as the only navigation method

### Bottom Tab Bar (Mobile)
- Best for: Mobile apps with 3-5 primary sections
- Maximum 5 tabs; more than 5 requires a "More" overflow
- Active tab uses filled icon and label; inactive tabs use outlined icons

## Form Patterns

### Inline Validation
- Validate on blur (when the user leaves the field), not on every keystroke
- Show success state for valid fields to build confidence
- Place error messages directly below the relevant field
- Use specific error messages: "Password must be at least 8 characters" not "Invalid input"

### Multi-Step Forms (Wizards)
- Show progress indicator (step 1 of 4) with step labels
- Allow backward navigation to review previous steps
- Save progress between steps (do not lose data on back-navigation)
- Final step shows a summary for review before submission
- Keep each step focused on one logical group of inputs

### Autosave
- Save drafts automatically at intervals or on field change
- Show save status clearly: "Saved", "Saving...", "Unsaved changes"
- Provide explicit save/discard actions for critical data

## Modal and Dialog Patterns

### When to Use Modals
- Confirming destructive actions ("Delete this item?")
- Collecting small amounts of focused input (rename, quick settings)
- Displaying critical alerts that require acknowledgment

### When NOT to Use Modals
- Displaying large amounts of content (use a new page instead)
- Nested modals (modal opening another modal — always avoid)
- Optional information (use inline expansion or tooltips)

### Modal Implementation Rules
- Trap keyboard focus inside the modal while open
- Close on Escape key press
- Close on overlay/backdrop click (except for critical confirmations)
- Return focus to the trigger element when closed
- Prevent background scrolling while modal is open

## Progressive Disclosure

### Pattern
Show only essential information initially; reveal detail on demand.

### Applications
- **Accordion sections**: Collapse secondary content; expand on click
- **"Show more" links**: Truncate long lists/text with option to expand
- **Advanced settings**: Hide behind a "Show advanced options" toggle
- **Contextual help**: Show tips/explanations via info icons or tooltips, not inline clutter

### Rule
Every screen should have a clear primary action. If users are overwhelmed, you are showing too much at once.

## Infinite Scroll vs Pagination

### Infinite Scroll
- Best for: Social feeds, media galleries, content discovery
- Show loading indicator at bottom when fetching more
- Provide "Back to top" button after scrolling
- Caution: Breaks browser back button, makes footer unreachable, loses scroll position

### Pagination
- Best for: Search results, data tables, e-commerce listings
- Show total count and current position ("Showing 1-20 of 347")
- Include: Previous, Next, first/last page, and 2-3 surrounding page numbers
- Preserve filter/sort state across page changes

## Drag and Drop

### When Appropriate
- Reordering lists, kanban boards, file uploads, layout builders
- Always provide a non-drag alternative (move up/down buttons, keyboard shortcuts)

### Implementation
- Show a grab cursor on hover of draggable items
- Provide a clear visual drop target (highlighted zone, insertion line)
- Show a ghost/preview of the dragged item
- Support undo immediately after drop (Ctrl+Z or undo toast)

## Micro-Interactions

### Definition
Small, single-purpose animations or feedback moments that make the interface feel responsive.

### Key Micro-Interactions
- **Button feedback**: Subtle press/depress animation on click
- **Toggle transitions**: Smooth state change (on/off) with color shift
- **Success confirmation**: Brief checkmark animation after form submission
- **Skeleton loading**: Content-shaped placeholders that pulse while loading
- **Pull to refresh**: Resistance and spinner animation (mobile)

### Rules
- Keep animations under 300ms — longer feels sluggish
- Use easing (ease-out for entrances, ease-in for exits) — linear motion feels robotic
- Respect `prefers-reduced-motion` media query — disable animations for users who request it

## Error Prevention Patterns

- **Confirmation dialogs** for destructive actions (delete, overwrite, send)
- **Undo** instead of confirmation when possible (Gmail's "Undo send" is superior to "Are you sure?")
- **Constraints**: Disable invalid options rather than showing errors after selection
- **Defaults**: Pre-fill with sensible defaults to reduce input errors
- **Format hints**: Show expected format inline ("DD/MM/YYYY") not just in error messages

## Responsive Breakpoint Strategy

### Standard Breakpoints
- **Mobile**: 320px - 767px (single column, stacked layout)
- **Tablet**: 768px - 1023px (two columns, collapsible side nav)
- **Desktop**: 1024px - 1439px (full layout, side nav expanded)
- **Large desktop**: 1440px+ (max-width container, avoid stretching content beyond ~1200px)

### Design Approach
- Design mobile-first: start with the smallest screen, add complexity as space allows
- Use fluid grids and relative units (%, rem) not fixed pixels
- Test at breakpoint boundaries AND mid-points (avoid layout breaking at 900px between 768 and 1024)
- Touch targets: minimum 44x44px on mobile (Apple HIG), 48x48px (Material Design)

## UI brief completeness before design comparison

Before proposing materially different layouts or visual directions, answer the
following questions for the screen or journey. The answers may be brief, but
each must be specific enough to guide implementation and later verification.
If a material answer is missing, ask focused questions before creating or
scoring alternatives. Do not invent a layout preference from a screenshot
alone.

| Question | Minimum answer to capture |
|---|---|
| Primary user and job | Who is acting, what must they accomplish, and what observable result means success? |
| Information hierarchy | What is primary, supporting, secondary, and deliberately hidden? Which data belongs together? |
| Content and density | What is the expected amount of content, ordering, grouping, sorting, and scan pattern? |
| Viewport and layout | What are the target viewport(s), max-width, column proportions, and responsive collapse rules? |
| Navigation and context | What remains visible while working, and how does the user move between related views? |
| Interaction ownership | Which elements are read-only, editable, selectable, destructive, or merely links? |
| State coverage | What should loading, empty, partial, error, retry, success, disabled, and stale states say and do? |
| Accessibility | What are the semantic roles, keyboard order, focus behavior, labels, contrast, and non-color cues? |
| Visual language | What tone, theme modes, semantic colors, typography, iconography, and emphasis hierarchy are intended? |
| Preserve or change | Which existing behavior, terminology, data relationship, and direct link must remain, and what may change? |
| Measurement and evidence | Which journey, viewport, task time/friction signal, browser proof, and review artifact will compare outcomes? |

Treat this as a completeness check, not a ceremony: skip a question only with a
recorded reason that it does not affect the current decision. Once complete,
freeze the answers and use the [design comparison and selection
protocol](#design-comparison-and-selection) for materially different options.

## Pastel color system and contrast maintenance

Pastel is a relationship between hue, saturation, brightness, and its
surrounding surface—not a fixed list of pale hex values. Start with a clear
base color that communicates the semantic role, then pastelize it by reducing
saturation and increasing brightness or lightness until it feels soft without
becoming gray or washed out. Check the result on the actual canvas and surface
colors; the same color can feel cheerful in a light theme and muddy or vivid in
a dark theme.

Use a small semantic palette rather than assigning arbitrary colors to every
component. For example, a warm yellow, soft pink, sky blue, and matcha green
can represent four different semantic roles in a generic product. These
semantic colors should remain distinct from any separate status, priority, or
category scale. The color meaning must come from the product's domain
vocabulary, not from the color name itself; document the mapping wherever the
product defines its terminology.

### Light theme

- Use bright, low-saturation surfaces with enough base-color presence to make
  adjacent categories scannable.
- Dim a color that attracts the eye more than neighboring rows before changing
  the whole palette. A pastel yellow often needs slightly lower brightness than
  pastel pink, blue, or matcha even when all four use the same saturation rule.
- Keep body text dark enough for comfortable reading, but do not compensate for
  a vivid fill by making every label black or adding heavy borders.

### Dark theme

- Keep the overall canvas and surfaces dark, then use controlled colored fills
  or darkened/tinted equivalents of the light-theme base color. Do not simply
  copy light-theme fills at full brightness.
- When a dark theme feels harsh, adjust text luminosity before darkening the
  background again. The background may need to be a little brighter for
  category recognition while the text becomes a little less luminous.
- Avoid pure white for ordinary dark-theme text and active controls. Use a
  readable off-white or tinted foreground for headings and primary controls,
  then a lower-luminosity muted tier for supporting text. Keep enough separation
  between tiers that hierarchy survives without producing glare.
- Tune colored row fills and priority markers independently from text. A small
  increase in fill brightness can preserve scannability while a small decrease
  in text luminosity reduces overall harshness.

### Control states and button decoration

- An **Active button** should have the strongest local emphasis, but not the
  brightest possible text. Prefer an accent background with readable,
  slightly softened foreground text over an accent background with pure white
  text.
- An **inactive button** should remain clearly actionable through its border,
  surface, and label contrast, while using less emphasis than the active
  button. Do not make inactive text so muted that the control appears disabled.
- Treat a link styled as a button as a button: explicitly set
  `text-decoration: none` on the button class so browser link underlines do not
  leak into the control. Preserve normal underlines for ordinary text links and
  preserve visible `:focus-visible` outlines for keyboard users.
- Check hover, focus, pressed, disabled, light-theme, and dark-theme states;
  the active state must not be the only state that is readable.

### Visual tuning loop

When visual review identifies glare, muddiness, or a category that disappears:

1. Keep the same color base and change one variable at a time: fill
   brightness, saturation, text luminosity, or border contrast.
2. Make a small adjustment—one step at a time—then compare the same journey at
   the same target viewport in both themes.
3. Use a cache-busting stylesheet revision or a fresh query parameter when
   validating static pages, so stale CSS is not mistaken for a design result.
4. Review the full hierarchy: canvas, panel, category fill, body text, muted
   text, active button, inactive button, focus outline, and disabled state.
5. Record the chosen values and the rejected direction when the change is
   accepted. This prevents a later attempt to fix harsh text by unnecessarily
   darkening or recoloring the entire interface.

## Design comparison and selection

Use this protocol from Refined Mockups and Application Design whenever more
than one materially different user-facing design could satisfy the approved
intent. A single design is sufficient only when alternatives would not change
the requested behavior materially or the user explicitly selects one.

1. Define at least two materially different options. State the decision they
   address and what is held constant: scope, data, target viewport, journey,
   and validation conditions.
2. Before review, define the frozen weighted scoring matrix. Use the default
   matrix below unless the goal record documents a justified replacement. Use weights
   summing to 100% and define a 1-to-5 scale using the same rubric for every
   option.
3. Each criterion score requires evidence. Keep qualitative review,
   implementation analysis, and executable browser/task evidence distinct. A
   screenshot or model preference is not browser/task evidence.
4. For browser UI, render every option at the same target viewport and run the
   same journey smoke checks. Record the viewport, journey steps, observed
   result, and artifact or command receipt for each option.
5. Calculate each weighted score as
   `sum((criterion score / 5) * weight)` and report the result as a percentage
   and a 1-to-5 equivalent. Select an option only when it reaches the
   selection threshold of 80% (4.0/5) and leads the next option by the lead
   margin of at least 5 percentage points (0.25/5). Otherwise preserve the
   trade-offs and ask the user for a decision or collect targeted evidence.
6. Record the selected option, rejected alternatives, frozen matrix, scores,
   evidence, trade-offs, and user approval in the AIDX goal record so the decision
   remains traceable through requirements, design, implementation, and the
   final gate.

### Default comparison matrix

| Criterion | Weight | 1 | 3 | 5 |
|---|---:|---|---|---|
| Primary task completion and correctness | 25% | fails core journey | works with friction | clear and reliable |
| Discoverability and task focus | 20% | hidden or distracting | understandable | immediately obvious |
| Error, success, and recovery behavior | 15% | silent or unsafe | visible but basic | actionable and durable |
| Layout balance and scanability at target viewport | 15% | cramped or flat | usable | balanced and readable |
| Accessibility and responsive behavior | 10% | blocked or fragile | basic support | keyboard, contrast, and responsive states are strong |
| Implementation and maintenance fit | 10% | conflicts with constraints | workable | simple and well-bounded |
| Future extensibility without clutter | 5% | blocks likely change | tolerates change | extends cleanly |
| **Total** | **100%** |  |  |  |

The matrix is a default, not a license to score unsupported qualities. If a
criterion is not applicable, replace it before the matrix is frozen and state
why. Do not change weights or criteria after seeing scores without recording a
re-plan.
