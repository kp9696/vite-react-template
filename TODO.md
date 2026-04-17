# HRMS UI Upgrades (5 Features)

## Current Progress
- [x] **Plan approved** by user
- [x] **1. Create TODO.md** ← Completed

## Implementation Steps (Execute in order)

### Phase 1: Foundation (CSS + Context)
- [ ] `app/app.css` - Dark mode vars, mobile overlay, skeleton styles ← Current step
- [ ] `app/root.tsx` - ThemeContext provider + useEffect sync

### Phase 2: Layout Enhancements
- [ ] `app/components/HRMSLayout.tsx` 
  - Mobile sidebar overlay + backdrop
  - Dark mode toggle button (topbar)
  - Quick actions dropdown (New Employee, Export, Settings)

### Phase 3: Page Skeletons
- [ ] `app/routes/hrms.tsx` - Stat cards + table skeletons
- [ ] `app/routes/hrms.leave.tsx` - Leave table + balance cards skeletons

### Phase 4: Verification
- [ ] Static code review complete
- [ ] User confirmation

**Status**: Implementing Phase 1 (starting with `app/app.css`)
