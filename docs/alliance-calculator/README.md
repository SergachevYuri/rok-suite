# Alliance Calculator

Resource and time projections for alliance-level construction tasks — primarily LK crusader flag costs and storehouse resource capacity.

**Live:** [/alliance-calculator](https://rok-suite-web.vercel.app/alliance-calculator)

## Flag Cost Calculator

Computes **base** and **discounted** resource costs for LK crusader flags (food, wood, stone, gold), factoring in the three alliance tech discounts:

| Tech | Max discount | Notes |
|------|--------------|-------|
| Architecture I | −10% | 6 levels: `0, 1, 2.5, 4, 6, 10` % |
| Architecture II | −15% | 11 levels: `0, 1, 2, 3, 4, 5, 6, 7.5, 9, 11, 15` % |
| Artisan's Spirit | −50% build time | 11 levels, applies to build duration, not cost |

Discounts stack additively; max combined resource discount is **25%**.

The rok.guide reference table shows costs at max tech (−25%), so the calculator backs out the true base cost as `table_cost / 0.75`, then applies the user's actual discount.

## Build Time

Base flag build time is **30 minutes**. Artisan's Spirit scales this down — at level 10 (+50% speed) a flag builds in 20 minutes. The calculator shows the effective time for your selected Artisan's Spirit level.

## Storehouse Projections

Estimate how much of each resource the alliance storehouse will protect based on the storehouse level and the contributing members' counts.

## Typical flow

1. Set your alliance's Architecture I, Architecture II, and Artisan's Spirit tech levels
2. Read off per-flag costs and build times
3. For storehouse planning, enter the storehouse level and member contribution assumptions
