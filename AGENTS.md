<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Persist shared participant timers in `room_timers`; derive countdowns from an absolute server-written deadline so admin and display remain synchronized without per-second writes.
- Timer mutations use the existing server-validated room admin token; public database access is read-only so display visitors cannot control a turn.
- Keep timer transitions in a browser-safe pure module for shared countdown calculations and focused rule tests.
