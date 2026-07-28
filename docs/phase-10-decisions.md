# Phase 10 decisions

- Added explicit match metadata for goal parameterization: competition type and friendly status.
- Results CSV can optionally provide `competition_type` and `is_friendly`.
- Match analytics now returns a `goal_parameter_profile` nested in the existing endpoint.
- The profile classifies goal volume, under/over signal, early goals and late goals.
- Friendlies remain visible but receive a reduced statistical weight of 0.35.
- Voice summaries include the goal profile when available.
- Product language frames findings as historical associations, not causal claims.
