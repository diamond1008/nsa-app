# iOS 27 & Instagram Animation System Implementation Plan

- **Goal**: Implement smooth, high-fidelity iOS spring physics and Instagram-style micro-interactions across the NSA Training Platform on local.
- **Rules**: Local only, NO commit, verify with lint and tests.

## Task Breakdown

### Task 1: Animation Tokens & Keyframes in `index.css`
- Add `--ease-spring`, `--ease-ios-sheet`, `--ease-ios-press` variables.
- Add keyframes: `springPopIn`, `instagramShimmer`, `staggerFadeUp`, `pillSlide`.
- Add utility classes: `.ios-press`, `.animate-ios-spring-pop`, `.instagram-shimmer`, `.ios-card-interactive`, `.animate-stagger-1`..`4`.

### Task 2: Core UI Components Enhancement in `ui.tsx`
- Update `Button`: add `.ios-press` (`active:scale-[0.97] transition-all duration-150`), refined focus and hover glow.
- Update `Modal`: replace basic fade/scale with `animate-ios-spring-pop`.
- Update `Drawer`: smooth iOS action sheet deceleration.
- Update `Skeleton`: replace simple pulse with `.instagram-shimmer`.
- Update `Select` custom dropdown: add spring pop animation.

### Task 3: Dropdowns & Modals in Sale & Pipeline
- Update `apps/web/src/features/sale/SaleDropdowns.tsx` with spring entrance (`animate-ios-spring-pop`) and origin anchoring.
- Update `CreateRegistrationOrderModal.tsx` and `EditInstallmentsModal.tsx` rows for smooth addition/deletion.

### Task 4: Sidebar, Navigation & KPI Cards
- Enhance `apps/web/src/app/AppLayout.tsx`: sidebar hover, group toggles, and notification popovers.
- Add tactile press feedback to table rows and actionable cards.

### Task 5: Verification & Testing
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- Check live local server at `http://localhost:5173`.
