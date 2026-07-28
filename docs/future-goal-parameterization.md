# Future phase: goal-minute and goal-volume parameterization

This phase must be implemented after voice interaction.

## Goal

Add advanced match parameterization based on:

- Goal minutes.
- Total goal count.
- Goal intervals.
- League or competition type.
- Official match versus friendly.
- Reduced weight for friendlies.

## Expected analysis

- Early goals.
- Late goals.
- Under/over patterns.
- Team scoring and conceding intervals.
- Match profiles by competition type.
- Separate handling for domestic leagues, cups, continental competitions and friendlies.

## Product behavior

- Dashboard filters should expose these parameters.
- Match detail should explain how goal timing and goal volume affect the reading.
- Voice queries should be able to ask for these patterns directly.
- Results must be framed as historical associations, not causal claims.
