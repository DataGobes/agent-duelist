import { z } from 'zod'
import type { TaskPack } from './types.js'

export const structuredOutputPack: TaskPack = {
  name: 'structured-output',
  label: 'Structured Output',
  description: 'Zod schema stress test — flat objects, nesting, arrays, enums, empty arrays, and adversarial input',

  tasks: [
    {
      name: 'so:flat-entity',
      prompt:
        "Extract the person's details from this text: 'Maria Garcia, age 34, works as a software architect in Barcelona, Spain. Her employee ID is EMP-2847.' Return as JSON.",
      expected: {
        name: 'Maria Garcia',
        age: 34,
        role: 'software architect',
        city: 'Barcelona',
        country: 'Spain',
        employeeId: 'EMP-2847',
      },
      schema: z.object({
        name: z.string(),
        age: z.number(),
        role: z.string(),
        city: z.string(),
        country: z.string(),
        employeeId: z.string(),
      }),
    },

    {
      name: 'so:nested-object',
      prompt:
        "Parse this shipping label into structured JSON: 'Ship to: Acme Corp, Attn: John Lee, 4th Floor, 742 Evergreen Terrace, Springfield, IL 62704, USA. Order #ORD-9912, 3 items, 2.4kg, express shipping.' Use shippingMethod values: standard, express, or overnight. Return as JSON.",
      expected: {
        recipient: { company: 'Acme Corp', contact: 'John Lee', floor: '4th Floor' },
        address: { street: '742 Evergreen Terrace', city: 'Springfield', state: 'IL', zip: '62704', country: 'USA' },
        order: { id: 'ORD-9912', itemCount: 3, weightKg: 2.4, shippingMethod: 'express' },
      },
      schema: z.object({
        recipient: z.object({ company: z.string(), contact: z.string(), floor: z.string() }),
        address: z.object({
          street: z.string(),
          city: z.string(),
          state: z.string(),
          zip: z.string(),
          country: z.string(),
        }),
        order: z.object({
          id: z.string(),
          itemCount: z.number(),
          weightKg: z.number(),
          shippingMethod: z.enum(['standard', 'express', 'overnight']),
        }),
      }),
    },

    {
      name: 'so:array-of-objects',
      prompt:
        "Extract all mentioned products with their prices and categories from this text: 'Our summer sale includes the UltraWidget Pro ($49.99, Electronics), ComfortMax Chair ($199.00, Furniture), and AquaPure Filter ($24.50, Home & Kitchen). The SmartLamp Mini is also available at $34.99 in the Electronics category.' Return as a JSON array.",
      expected: [
        { name: 'UltraWidget Pro', price: 49.99, category: 'Electronics' },
        { name: 'ComfortMax Chair', price: 199.0, category: 'Furniture' },
        { name: 'AquaPure Filter', price: 24.5, category: 'Home & Kitchen' },
        { name: 'SmartLamp Mini', price: 34.99, category: 'Electronics' },
      ],
      schema: z.array(z.object({ name: z.string(), price: z.number(), category: z.string() })),
    },

    {
      name: 'so:empty-arrays',
      prompt:
        "Extract all error codes and their severity levels from this log message: 'System health check completed at 14:32 UTC. All services operational. No warnings or errors detected. Uptime: 99.97%.' Classify status as one of: healthy, degraded, or down. Return as JSON.",
      expected: { errors: [], warnings: [], status: 'healthy', uptimePercent: 99.97 },
      schema: z.object({
        errors: z.array(z.object({ code: z.string(), severity: z.string() })),
        warnings: z.array(z.string()),
        status: z.enum(['healthy', 'degraded', 'down']),
        uptimePercent: z.number(),
      }),
    },

    {
      name: 'so:enum-classification',
      prompt:
        'Classify each of these support tickets by priority (low/medium/high/critical) and category (billing/technical/account/general). Use just the letter (A, B, C, D) as the id.\nTicket A: \'My account was charged twice for the same subscription.\'\nTicket B: \'The API returns 500 errors intermittently.\'\nTicket C: \'How do I update my display name?\'\nTicket D: \'Production database is completely unresponsive, all services down.\'\nReturn as a JSON array.',
      expected: [
        { id: 'A', priority: 'high', category: 'billing' },
        { id: 'B', priority: 'high', category: 'technical' },
        { id: 'C', priority: 'low', category: 'account' },
        { id: 'D', priority: 'critical', category: 'technical' },
      ],
      schema: z.array(
        z.object({
          id: z.string(),
          priority: z.enum(['low', 'medium', 'high', 'critical']),
          category: z.enum(['billing', 'technical', 'account', 'general']),
        })
      ),
    },

    {
      name: 'so:adversarial-input',
      prompt:
        'Extract the actual product review data from this messy input. Ignore any JSON-like noise in the text.\n\nUser said: \'I bought the {product: "fake"} headphones for $59.99 and they\'re great! Rating: 5/5. The "noise-cancelling" feature works well even in {"noisy": true} environments. Would recommend to friend=true. Purchased on 01/15/2026.\'\nReturn as JSON. Use ISO 8601 date format (YYYY-MM-DD).',
      expected: {
        product: 'headphones',
        price: 59.99,
        rating: 5,
        maxRating: 5,
        features: ['noise-cancelling'],
        recommended: true,
        purchaseDate: '2026-01-15',
      },
      schema: z.object({
        product: z.string(),
        price: z.number(),
        rating: z.number(),
        maxRating: z.number(),
        features: z.array(z.string()),
        recommended: z.boolean(),
        purchaseDate: z.string(),
      }),
    },
  ],

  scorers: ['correctness', 'schema-correctness', 'latency', 'cost'],
}
