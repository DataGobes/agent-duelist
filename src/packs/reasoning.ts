import { z } from 'zod'
import type { TaskPack } from './types.js'

export const reasoningPack: TaskPack = {
  name: 'reasoning',
  label: 'Reasoning',
  description: 'Logic, math, and multi-step thinking — arithmetic, deduction, data interpretation, critical path, and business rules',

  tasks: [
    {
      name: 'rs:saas-mrr-calc',
      prompt: `A SaaS company charges $49/month for the basic plan and $149/month for pro.
In Q1 they had 200 basic subscribers and 85 pro subscribers.
In Q2, 15% of basic users upgraded to pro and they gained 40 new basic subscribers.
No one churned. What is the Q2 monthly recurring revenue (MRR)?
Return as JSON with your reasoning and the final MRR number.`,
      expected: { mrr: 27425 },
      schema: z.object({
        reasoning: z.string().optional(),
        mrr: z.number(),
      }),
    },

    {
      name: 'rs:logical-deduction',
      prompt: `Five developers — Alice, Bob, Carol, Dave, and Eve — each use a different
primary language: Rust, TypeScript, Python, Go, and Java. Given:
1. Alice does not use Python, Java, or Go.
2. Bob uses TypeScript.
3. Carol uses neither Rust nor Go.
4. Dave does not use Java.
5. Eve uses neither Rust, Go, nor Java.
What language does each developer use? Return as JSON.`,
      expected: {
        Alice: 'Rust',
        Bob: 'TypeScript',
        Carol: 'Java',
        Dave: 'Go',
        Eve: 'Python',
      },
      schema: z.object({
        Alice: z.string(),
        Bob: z.string(),
        Carol: z.string(),
        Dave: z.string(),
        Eve: z.string(),
      }),
    },

    {
      name: 'rs:data-interpretation',
      prompt: `Given this quarterly revenue data:
| Quarter | Revenue | Growth |
|---------|---------|--------|
| Q1 2025 | $2.1M   | -      |
| Q2 2025 | $2.4M   | 14.3%  |
| Q3 2025 | $2.2M   | -8.3%  |
| Q4 2025 | $2.8M   | 27.3%  |

Which quarter had the highest absolute revenue increase compared to the previous
quarter? What was the full-year total revenue in millions? Return as JSON.`,
      expected: {
        highestGrowthQuarter: 'Q4 2025',
        absoluteIncrease: 0.6,
        fullYearRevenue: 9.5,
      },
      schema: z.object({
        highestGrowthQuarter: z.string(),
        absoluteIncrease: z.number(),
        fullYearRevenue: z.number(),
      }),
    },

    {
      name: 'rs:critical-path',
      prompt: `A deployment pipeline has these stages with dependencies:
- Build (3 min, no dependency)
- Unit tests (5 min, depends on Build)
- Integration tests (8 min, depends on Build)
- Security scan (4 min, depends on Build)
- Staging deploy (2 min, depends on Unit tests AND Integration tests AND Security scan)
- Smoke tests (3 min, depends on Staging deploy)

Assuming stages run in parallel where possible, what is the total pipeline
duration in minutes? Which stages are on the critical path? Return as JSON.`,
      expected: {
        totalMinutes: 16,
        criticalPath: ['Build', 'Integration tests', 'Staging deploy', 'Smoke tests'],
      },
      schema: z.object({
        totalMinutes: z.number(),
        criticalPath: z.array(z.string()),
      }),
    },

    {
      name: 'rs:pricing-rules',
      prompt: `Apply these pricing rules to each customer and return the final price:
Rules:
- Base price: $100
- Enterprise customers (>100 seats): 30% discount
- Annual billing: additional 15% off the discounted price
- Non-profit organizations: flat $50 regardless of other rules

Customers:
A: 50 seats, monthly billing, for-profit
B: 200 seats, annual billing, for-profit
C: 75 seats, annual billing, non-profit
D: 150 seats, monthly billing, for-profit

Return as a JSON array with customer id and finalPrice.`,
      expected: [
        { id: 'A', finalPrice: 100 },
        { id: 'B', finalPrice: 59.5 },
        { id: 'C', finalPrice: 50 },
        { id: 'D', finalPrice: 70 },
      ],
      schema: z.array(z.object({
        id: z.string(),
        finalPrice: z.number(),
      })),
    },
  ],

  scorers: ['correctness', 'latency', 'cost'],
}
