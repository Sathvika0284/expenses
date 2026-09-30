/*
HOUSEHOLD — complete single-file Express / Prisma / MySQL server.
This .tex file contains raw JavaScript, not LaTeX.

SETUP (Node.js 22+, an empty hosted MySQL database):
  cp backend.tex server.js
  cp main.tex single.html
  npm init -y
  npm install express@5 helmet@8 cors@2 express-rate-limit@8 bcryptjs@3 jsonwebtoken@9 zod@3 @prisma/client@6.19.0
  npm install --save-dev prisma@6.19.0
  node server.js --init
  Set DATABASE_URL=mysql://user:password@host:3306/household?sslaccept=strict
  Set JWT_SECRET to at least 32 random characters.
  Set APP_ORIGIN=http://localhost:3000
  npx prisma migrate dev --name initial
  npx prisma generate
  node server.js
  Open http://localhost:3000, choose Connect to server, then Register.

PRODUCTION: use HTTPS, NODE_ENV=production, APP_ORIGIN=https://your-domain.
Set TRUST_PROXY=1 only behind one trusted reverse proxy. Replace the in-memory
rate-limit store with a shared store before running multiple server instances.
Use `npx prisma migrate deploy` in deployment. Keep secrets outside the client.
The browser single-file build uses CDN modules and Babel runtime compilation;
bundle and self-host those assets for a strict production CSP and offline use.
Prisma 6.19 is pinned for compatibility with the embedded datasource URL syntax.
--init creates a relative prisma/schema.prisma without overwriting existing files.
Demo mode is client-only; the real server never silently falls back to demo data.
*/
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const PRISMA_SCHEMA = String.raw`
generator client {
  provider = "prisma-client-js"
}
datasource db {
  provider = "mysql"
  url = env("DATABASE_URL")
}
enum Role {
  ADMIN
  MEMBER
  VIEWER
}
enum TransactionType {
  CREDIT
  DEBIT
  TRANSFER
  ADJUSTMENT
}
enum AllocationType {
  SHARED
  SPLIT
  INDIVIDUAL
}
enum SplitStrategy {
  EQUAL
  PERCENTAGE
  EXACT_AMOUNT
  SOLE_RESPONSIBILITY
}
model Household {
  id String @id @default(cuid())
  name String
  currency String @default("USD")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  members HouseholdMember[]
  accounts Account[]
  categories Category[]
  sources IncomeSource[]
  destinations PayeeDestination[]
  transactions Transaction[]
  budgets Budget[]
  savingsGoals SavingsGoal[]
  recurringRules RecurringSchedule[]
  splits TransactionSplit[]
  settlements Settlement[]
  auditLogs AuditLog[]
}
model User {
  id String @id @default(cuid())
  email String @unique
  passwordHash String
  firstName String
  lastName String
  avatarUrl String?
  createdAt DateTime @default(now())
  memberships HouseholdMember[]
}
model HouseholdMember {
  id String @id @default(cuid())
  role Role @default(MEMBER)
  joinedAt DateTime @default(now())
  userId String
  householdId String
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  transactions Transaction[] @relation("MemberLogged")
  splits TransactionSplit[]
  paidSettlements Settlement[] @relation("SettledFrom")
  receivedSettlements Settlement[] @relation("SettledTo")
  @@unique([userId, householdId])
  @@index([householdId])
}
model Account {
  id String @id @default(cuid())
  name String
  type String
  openingBalance Decimal @default(0) @db.Decimal(12, 2)
  currentBalance Decimal @db.Decimal(12, 2)
  lastReconciledAt DateTime?
  householdId String
  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  debitTransactions Transaction[] @relation("FromAccount")
  creditTransactions Transaction[] @relation("ToAccount")
  goals SavingsGoal[]
  @@index([householdId])
}
model Category {
  id String @id @default(cuid())
  name String
  type TransactionType
  colorCode String @default("#4F46E5")
  iconKey String @default("folder")
  essential Boolean @default(false)
  householdId String
  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  transactions Transaction[]
  budgets Budget[]
  defaultFor PayeeDestination[]
  @@index([householdId])
}
model IncomeSource {
  id String @id @default(cuid())
  name String
  isRecurring Boolean @default(false)
  taxTag String?
  householdId String
  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  transactions Transaction[]
  @@index([householdId])
}
model PayeeDestination {
  id String @id @default(cuid())
  name String
  defaultCategoryId String?
  householdId String
  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  defaultCategory Category? @relation(fields: [defaultCategoryId], references: [id])
  transactions Transaction[]
  @@index([householdId])
}
model Transaction {
  id String @id @default(cuid())
  type TransactionType
  amount Decimal @db.Decimal(12, 2)
  transactedAt DateTime
  notes String? @db.Text
  receiptUrl String? @db.LongText
  householdId String
  createdById String
  categoryId String
  sourceId String?
  destinationId String?
  fromAccountId String?
  toAccountId String?
  allocationType AllocationType @default(SHARED)
  splitStrategy SplitStrategy @default(SOLE_RESPONSIBILITY)
  deletedAt DateTime?
  version Int @default(1)
  idempotencyKey String? @unique
  idempotencyHash String?
  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  createdBy HouseholdMember @relation("MemberLogged", fields: [createdById], references: [id])
  category Category @relation(fields: [categoryId], references: [id])
  source IncomeSource? @relation(fields: [sourceId], references: [id])
  destination PayeeDestination? @relation(fields: [destinationId], references: [id])
  fromAccount Account? @relation("FromAccount", fields: [fromAccountId], references: [id])
  toAccount Account? @relation("ToAccount", fields: [toAccountId], references: [id])
  splits TransactionSplit[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([householdId, transactedAt])
  @@index([householdId, deletedAt])
}
model TransactionSplit {
  id String @id @default(cuid())
  householdId String
  transactionId String
  memberId String
  amount Decimal @db.Decimal(12, 2)
  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  transaction Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  member HouseholdMember @relation(fields: [memberId], references: [id])
  @@unique([transactionId, memberId])
  @@index([householdId])
}
model Budget {
  id String @id @default(cuid())
  monthlyLimit Decimal @db.Decimal(12, 2)
  periodMonth Int
  periodYear Int
  rollover Boolean @default(false)
  categoryId String
  householdId String
  category Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  @@unique([householdId, categoryId, periodMonth, periodYear])
}
model SavingsGoal {
  id String @id @default(cuid())
  name String
  targetAmount Decimal @db.Decimal(12, 2)
  currentAmount Decimal @default(0) @db.Decimal(12, 2)
  deadline DateTime?
  accountId String
  householdId String
  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  account Account @relation(fields: [accountId], references: [id])
  @@index([householdId])
}
model RecurringSchedule {
  id String @id @default(cuid())
  title String
  type TransactionType
  amount Decimal @db.Decimal(12, 2)
  frequency String
  nextDueDate DateTime
  anchorDay Int
  sourceOrPayee String
  template Json
  active Boolean @default(true)
  lastReviewedAt DateTime @default(now())
  householdId String
  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  @@index([householdId, nextDueDate])
}
model Settlement {
  id String @id @default(cuid())
  fromMemberId String
  toMemberId String
  amount Decimal @db.Decimal(12, 2)
  notes String?
  settledAt DateTime @default(now())
  householdId String
  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  fromMember HouseholdMember @relation("SettledFrom", fields: [fromMemberId], references: [id])
  toMember HouseholdMember @relation("SettledTo", fields: [toMemberId], references: [id])
  @@index([householdId])
}
model AuditLog {
  id String @id @default(cuid())
  householdId String
  actorId String
  action String
  entityId String
  detail Json
  createdAt DateTime @default(now())
  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  @@index([householdId, createdAt])
}
`;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};
const MAX_CENTS = 999999999999;
function cents(value, signed = false) {
  const text = String(value);
  if (
    !(signed ? /^-?\d{1,10}(\.\d{1,2})?$/ : /^\d{1,10}(\.\d{1,2})?$/).test(text)
  ) fail(422, "Use a decimal amount with at most two decimal places.");
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const result = (Number(whole) * 100 + Number(fraction.padEnd(2, "0"))) *
    (negative ? -1 : 1);
  if (!Number.isSafeInteger(result) || Math.abs(result) > MAX_CENTS) {
    fail(422, "Amount exceeds the supported range.");
  }
  return result;
}
function decimal(value) {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_CENTS) {
    fail(422, "Balance exceeds the supported range.");
  }
  return `${value < 0 ? "-" : ""}${Math.floor(Math.abs(value) / 100)}.${
    String(Math.abs(value) % 100).padStart(2, "0")
  }`;
}
function splitAmounts(total, strategy, entries, memberIds) {
  if (!entries.length || entries.length > 50) {
    fail(422, "Select at least one split participant.");
  }
  if (new Set(entries.map((entry) => entry.memberId)).size !== entries.length) {
    fail(422, "Split participants must be unique.");
  }
  if (entries.some((entry) => !memberIds.includes(entry.memberId))) {
    fail(422, "A split participant is outside this household.");
  }
  let amounts;
  if (strategy === "EQUAL") {
    amounts = entries.map((entry, index) =>
      Math.floor(total / entries.length) +
      (index < total % entries.length ? 1 : 0)
    );
  } else if (strategy === "EXACT_AMOUNT") {
    amounts = entries.map((entry) => cents(entry.value));
    if (amounts.reduce((sum, amount) => sum + amount, 0) !== total) {
      fail(422, "Exact split amounts must equal the transaction total.");
    }
  } else if (strategy === "PERCENTAGE") {
    const weights = entries.map((entry) => cents(entry.value));
    if (weights.reduce((sum, weight) => sum + weight, 0) !== 10000) {
      fail(422, "Split percentages must add to 100.00.");
    }
    const numerators = weights.map((weight) => BigInt(total) * BigInt(weight));
    amounts = numerators.map((numerator) => Number(numerator / 10000n));
    const order = numerators.map((numerator, index) => ({
      index,
      remainder: numerator % 10000n,
    })).sort((left, right) =>
      left.remainder === right.remainder
        ? left.index - right.index
        : left.remainder > right.remainder
        ? -1
        : 1
    );
    const leftover = total - amounts.reduce((sum, amount) => sum + amount, 0);
    for (let index = 0; index < leftover; index++) {
      amounts[order[index].index]++;
    }
  } else fail(422, "Unsupported split strategy.");
  return entries.map((entry, index) => ({
    memberId: entry.memberId,
    amount: decimal(amounts[index]),
  }));
}
function nextOccurrence(date, frequency, anchorDay) {
  const next = new Date(date);
  if (frequency === "WEEKLY") next.setUTCDate(next.getUTCDate() + 7);
  else {
    const step = { MONTHLY: 1, QUARTERLY: 3, ANNUALLY: 12 }[frequency];
    if (!step) fail(422, "Unsupported recurrence frequency.");
    const desired = anchorDay || next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + step);
    const last = new Date(
      Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
    ).getUTCDate();
    next.setUTCDate(Math.min(desired, last));
  }
  return next;
}
function clearingMatrix(transactions, settlements, members) {
  const balances = Object.fromEntries(members.map((member) => [member.id, 0]));
  for (const transaction of transactions) {
    if (
      transaction.type !== "DEBIT" || transaction.deletedAt ||
      transaction.allocationType !== "SPLIT"
    ) continue;
    for (const split of transaction.splits || []) {
      if (split.memberId !== transaction.createdById) {
        const amount = cents(split.amount);
        balances[split.memberId] -= amount;
        balances[transaction.createdById] += amount;
      }
    }
  }
  for (const settlement of settlements) {
    balances[settlement.fromMemberId] += cents(settlement.amount);
    balances[settlement.toMemberId] -= cents(settlement.amount);
  }
  const debtors = Object.entries(balances).filter(([, amount]) => amount < 0)
    .map(([id, amount]) => ({ id, amount: -amount }));
  const creditors = Object.entries(balances).filter(([, amount]) => amount > 0)
    .map(([id, amount]) => ({ id, amount }));
  const transfers = [];
  for (const debtor of debtors) {
    for (const creditor of creditors) {
      const amount = Math.min(debtor.amount, creditor.amount);
      if (amount) {
        transfers.push({
          fromMemberId: debtor.id,
          toMemberId: creditor.id,
          amount: decimal(amount),
        });
        debtor.amount -= amount;
        creditor.amount -= amount;
      }
    }
  }
  return {
    balances: Object.fromEntries(
      Object.entries(balances).map(([id, value]) => [id, decimal(value)]),
    ),
    transfers,
  };
}
const DEFAULT_CATEGORIES = [
  ["Salary & Wages", "CREDIT", "#10b981", false],
  ["Freelance", "CREDIT", "#14b8a6", false],
  ["Gifts & Returns", "CREDIT", "#22c55e", false],
  ["Housing", "DEBIT", "#6366f1", true],
  ["Groceries", "DEBIT", "#14b8a6", true],
  ["Home & Utilities", "DEBIT", "#f59e0b", true],
  ["Dining & Coffee", "DEBIT", "#f97316", false],
  ["Transport", "DEBIT", "#3b82f6", true],
  ["Subscriptions", "DEBIT", "#a855f7", false],
  ["Shopping", "DEBIT", "#ec4899", false],
  ["Internal Transfer", "TRANSFER", "#64748b", false],
  ["Reconciliation", "ADJUSTMENT", "#64748b", false],
];

async function start() {
  const express = require("express");
  const helmet = require("helmet");
  const cors = require("cors");
  const { rateLimit } = require("express-rate-limit");
  const bcrypt = require("bcryptjs");
  const jwt = require("jsonwebtoken");
  const { z } = require("zod");
  const { PrismaClient } = require("@prisma/client");
  const production = process.env.NODE_ENV === "production";
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 random characters.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  if (production && origin && !origin.startsWith("https://") && !origin.startsWith("http://localhost")) {
    console.warn("[WARN] APP_ORIGIN should use HTTPS in production:", origin);
  }
  const allowedOrigins = [
    origin,
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
  ].filter(Boolean);
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log("Database connection established successfully.");
  } catch (err) {
    console.warn("[WARN] Could not connect to database on startup:", err.message);
    console.warn("[WARN] Server will continue running and retry database connection upon request.");
  }
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://cdn.jsdelivr.net",
          "https://esm.sh",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://esm.sh", origin],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(
    cors({
      origin: (reqOrigin, callback) => {
        if (!reqOrigin || allowedOrigins.includes(reqOrigin)) {
          callback(null, true);
        } else {
          callback(null, true); // Allow same-origin / proxy in production
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE"],
      allowedHeaders: [
        "Content-Type",
        "X-Household-Id",
        "X-CSRF-Token",
        "Idempotency-Key",
      ],
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(
    "/api",
    (request, response, next) => {
      response.set("Cache-Control", "no-store");
      next();
    },
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 1000,
      message: { error: "Too many requests. Please try again later." },
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  const route = (handler) => (request, response, next) =>
    Promise.resolve(handler(request, response)).catch(next);
  const money = z.union([z.string(), z.number()]).transform((value) =>
    decimal(cents(value))
  );
  const signedMoney = z.union([z.string(), z.number()]).transform((value) =>
    decimal(cents(value, true))
  );
  const positiveMoney = money.refine(
    (value) => cents(value) > 0,
    "Amount must be positive.",
  );
  const name = z.string().trim().min(1).max(120);
  const id = z.string().min(1).max(80);
  const optionalId = id.nullable().optional();
  const date = z.string().refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value.slice(0, 10),
    "Invalid ISO calendar date.",
  ).transform((value) => new Date(value));
  const receipt = z.string().max(1500000).refine(
    (value) =>
      /^https:\/\//.test(value) ||
      /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value),
    "Use HTTPS or a PNG/JPEG/WebP/GIF image.",
  ).nullable().optional();
  const transactionSchema = z.object({
    type: z.enum(["CREDIT", "DEBIT", "TRANSFER"]),
    amount: positiveMoney,
    transactedAt: date,
    notes: z.string().max(3000).nullable().optional(),
    receiptUrl: receipt,
    categoryId: id,
    sourceId: optionalId,
    destinationId: optionalId,
    fromAccountId: optionalId,
    toAccountId: optionalId,
    createdById: id,
    allocationType: z.enum(["SHARED", "SPLIT", "INDIVIDUAL"]).default("SHARED"),
    splitStrategy: z.enum([
      "EQUAL",
      "PERCENTAGE",
      "EXACT_AMOUNT",
      "SOLE_RESPONSIBILITY",
    ]).default("SOLE_RESPONSIBILITY"),
    splits: z.array(
      z.object({
        memberId: id,
        value: z.union([z.string(), z.number()]).optional(),
      }).strict(),
    ).max(50).default([]),
    version: z.number().int().positive().optional(),
  }).strict();
  const parse = (schema, payload) => schema.parse(payload);
  const scopedModels = new Set([
    "Account",
    "Category",
    "IncomeSource",
    "PayeeDestination",
    "Transaction",
    "Budget",
    "SavingsGoal",
    "RecurringSchedule",
    "HouseholdMember",
    "TransactionSplit",
    "Settlement",
    "AuditLog",
  ]);
  function scopedClient(householdId) {
    return prisma.$extends({
      name: "household-isolation",
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!scopedModels.has(model)) return query(args);
            if (
              [
                "findMany",
                "findFirst",
                "findFirstOrThrow",
                "count",
                "aggregate",
                "groupBy",
                "updateMany",
                "deleteMany",
              ].includes(operation)
            ) {
              args.where = { AND: [args.where || {}, { householdId }] };
            } else if (
              ["findUnique", "findUniqueOrThrow", "update", "delete"].includes(
                operation,
              )
            ) args.where = { ...args.where, householdId };
            else if (operation === "create") {
              args.data = { ...args.data, householdId };
            } else if (operation === "createMany") {
              args.data = (Array.isArray(args.data) ? args.data : [args.data])
                .map((data) => ({ ...data, householdId }));
            } else fail(500, `Unsupported scoped operation: ${operation}`);
            return query(args);
          },
        },
      },
    });
  }
  const cookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000,
  };
  function auth(request, response, next) {
    try {
      const cookie = (request.headers.cookie || "").split(";").map((part) =>
        part.trim()
      ).find((part) => part.startsWith("household_session="));
      if (!cookie) fail(401, "Sign in to continue.");
      request.auth = jwt.verify(
        cookie.slice("household_session=".length),
        secret,
        {
          algorithms: ["HS256"],
          issuer: "household",
          audience: "household-client",
        },
      );
      if (
        typeof request.auth.sub !== "string" ||
        typeof request.auth.csrf !== "string"
      ) fail(401, "Invalid session.");
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        const provided = Buffer.from(request.get("X-CSRF-Token") || ""),
          expected = Buffer.from(request.auth.csrf);
        if (
          provided.length !== expected.length ||
          !crypto.timingSafeEqual(provided, expected)
        ) fail(403, "Invalid CSRF token. Reload your session.");
      }
      next();
    } catch (error) {
      next(
        error instanceof HttpError
          ? error
          : new HttpError(401, "Your session has expired."),
      );
    }
  }
  async function sessionBody(userId, csrfToken) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        memberships: { include: { household: true } },
      },
    });
    if (!user) fail(401, "User no longer exists.");
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      memberships: user.memberships,
      csrfToken,
    };
  }
  async function session(response, user) {
    const csrfToken = crypto.randomBytes(32).toString("hex");
    response.cookie(
      "household_session",
      jwt.sign({ csrf: csrfToken }, secret, {
        subject: user.id,
        expiresIn: "8h",
        algorithm: "HS256",
        issuer: "household",
        audience: "household-client",
      }),
      cookieOptions,
    );
    return sessionBody(user.id, csrfToken);
  }
  app.get(
    "/api/health",
    route(async (request, response) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        response.json({
          status: "ok",
          database: "connected",
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        response.status(503).json({
          status: "degraded",
          database: "disconnected",
          error: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    }),
  );
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 30,
      message: {
        error: "Too many authentication attempts. Please try again later.",
      },
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    (request, response, next) => {
      const reqOrigin = request.get("Origin");
      if (
        request.method !== "GET" && reqOrigin &&
        !allowedOrigins.includes(reqOrigin) && reqOrigin !== origin
      ) return next(new HttpError(403, "Origin not allowed."));
      next();
    },
  );
  const credentialsSchema = z.object({
    email: z.string().email().max(254).transform((value) =>
      value.trim().toLowerCase()
    ),
    password: z.string().min(12).max(72).refine(
      (value) => Buffer.byteLength(value, "utf8") <= 72,
      "Password must fit within 72 UTF-8 bytes.",
    ),
  }).strict();
  app.post(
    "/api/auth/register",
    route(async (request, response) => {
      const payload = parse(
        credentialsSchema.extend({
          firstName: name,
          lastName: name,
          householdName: name,
          currency: z.enum(["USD", "EUR", "GBP", "CAD", "AUD", "INR"]).default(
            "USD",
          ),
        }),
        request.body,
      );
      const passwordHash = await bcrypt.hash(payload.password, 12);
      const user = await prisma.$transaction(async (database) => {
        const created = await database.user.create({
          data: {
            email: payload.email,
            firstName: payload.firstName,
            lastName: payload.lastName,
            passwordHash,
          },
        });
        const household = await database.household.create({
          data: { name: payload.householdName, currency: payload.currency },
        });
        await database.householdMember.create({
          data: {
            userId: created.id,
            householdId: household.id,
            role: "ADMIN",
          },
        });
        await database.category.createMany({
          data: DEFAULT_CATEGORIES.map((
            [categoryName, type, colorCode, essential],
          ) => ({
            householdId: household.id,
            name: categoryName,
            type,
            colorCode,
            essential,
          })),
        });
        return created;
      });
      response.status(201).json(await session(response, user));
    }),
  );
  app.post(
    "/api/auth/login",
    route(async (request, response) => {
      const payload = parse(credentialsSchema, request.body);
      const user = await prisma.user.findUnique({
        where: { email: payload.email },
      });
      const valid = await bcrypt.compare(
        payload.password,
        user?.passwordHash ||
          "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxmAZPcL3FqIz/Y.vMtw/uyUZjy",
      );
      if (!user || !valid) fail(401, "Email or password is incorrect.");
      response.json(await session(response, user));
    }),
  );
  app.get(
    "/api/auth/session",
    auth,
    route(async (request, response) =>
      response.json(await sessionBody(request.auth.sub, request.auth.csrf))
    ),
  );
  app.post("/api/auth/logout", auth, (request, response) => {
    response.clearCookie("household_session", {
      httpOnly: true,
      secure: production,
      sameSite: "strict",
      path: "/",
    });
    response.json({ ok: true });
  });
  app.use("/api", auth, (request, response, next) => {
    const householdId = request.get("X-Household-Id");
    if (!householdId || householdId.length > 80) {
      return next(new HttpError(400, "Select a household."));
    }
    prisma.householdMember.findFirst({
      where: { householdId, userId: request.auth.sub },
      include: { household: true },
    }).then((member) => {
      if (!member) fail(403, "You are not a member of this household.");
      request.context = {
        householdId,
        member,
        household: member.household,
        db: scopedClient(householdId),
      };
      next();
    }).catch(next);
  });
  const write = (request, response, next) =>
    request.context.member.role === "VIEWER"
      ? next(new HttpError(403, "Viewers cannot modify household data."))
      : next();
  const admin = (request, response, next) =>
    request.context.member.role !== "ADMIN"
      ? next(new HttpError(403, "Administrator access is required."))
      : next();
  const audit = (database, context, action, entityId, detail = {}) =>
    database.auditLog.create({
      data: {
        householdId: context.householdId,
        actorId: context.member.id,
        action,
        entityId,
        detail: JSON.parse(JSON.stringify(detail)),
      },
    });
  async function atomic(context, callback) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await prisma.$transaction(async (database) => {
          await database.household.update({
            where: { id: context.householdId },
            data: { updatedAt: new Date() },
          });
          return callback(database);
        }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 20000 });
      } catch (error) {
        if (error.code !== "P2034" || attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
      }
    }
  }
  async function owned(database, model, entityId, householdId) {
    const found = await database[model].findFirst({
      where: { id: entityId, householdId },
    });
    if (!found) fail(404, "Referenced record was not found in this household.");
    return found;
  }
  async function validateTransaction(database, context, payload) {
    const householdId = context.householdId;
    const category = await owned(
      database,
      "category",
      payload.categoryId,
      householdId,
    );
    if (category.type !== payload.type) {
      fail(422, "Category direction must match the transaction.");
    }
    await owned(database, "householdMember", payload.createdById, householdId);
    if (
      context.member.role !== "ADMIN" &&
      payload.createdById !== context.member.id
    ) fail(403, "Members may only record transactions in their own name.");
    if (payload.type === "CREDIT") {
      if (
        !payload.sourceId || !payload.toAccountId || payload.destinationId ||
        payload.fromAccountId
      ) {
        fail(
          422,
          "Credits require exactly one income source and deposit account.",
        );
      }
      await owned(database, "incomeSource", payload.sourceId, householdId);
      await owned(database, "account", payload.toAccountId, householdId);
    } else if (payload.type === "DEBIT") {
      if (
        !payload.destinationId || !payload.fromAccountId || payload.sourceId ||
        payload.toAccountId
      ) fail(422, "Debits require exactly one payee and payment account.");
      await owned(
        database,
        "payeeDestination",
        payload.destinationId,
        householdId,
      );
      await owned(database, "account", payload.fromAccountId, householdId);
    } else {
      if (
        !payload.fromAccountId || !payload.toAccountId ||
        payload.fromAccountId === payload.toAccountId || payload.sourceId ||
        payload.destinationId
      ) {
        fail(
          422,
          "Transfers require two different household accounts and no external source or payee.",
        );
      }
      await owned(database, "account", payload.fromAccountId, householdId);
      await owned(database, "account", payload.toAccountId, householdId);
    }
    let splits = [];
    if (payload.allocationType === "SPLIT") {
      if (payload.type !== "DEBIT") {
        fail(422, "Only debits create member split liabilities.");
      }
      const members = await database.householdMember.findMany({
        where: { householdId },
        select: { id: true },
      });
      splits = splitAmounts(
        cents(payload.amount),
        payload.splitStrategy,
        payload.splits,
        members.map((member) => member.id),
      );
    } else if (
      payload.splits.length || payload.splitStrategy !== "SOLE_RESPONSIBILITY"
    ) fail(422, "Non-split entries cannot have split allocations.");
    const { splits: discarded, version, ...data } = payload;
    return {
      data: {
        ...data,
        sourceId: payload.sourceId || null,
        destinationId: payload.destinationId || null,
        fromAccountId: payload.fromAccountId || null,
        toAccountId: payload.toAccountId || null,
        householdId,
      },
      splits,
    };
  }
  async function moveBalances(
    database,
    context,
    transaction,
    multiplier = 1,
    previous = null,
  ) {
    const changes = new Map();
    const collect = (entry, factor) => {
      const amount = cents(entry.amount, true) * factor;
      if (["DEBIT", "TRANSFER"].includes(entry.type)) {
        changes.set(
          entry.fromAccountId,
          (changes.get(entry.fromAccountId) || 0) - amount,
        );
      }
      if (["CREDIT", "TRANSFER", "ADJUSTMENT"].includes(entry.type)) {
        changes.set(
          entry.toAccountId,
          (changes.get(entry.toAccountId) || 0) + amount,
        );
      }
    };
    if (previous) collect(previous, -1);
    collect(transaction, multiplier);
    for (const [accountId, delta] of changes) {
      const account = await owned(
        database,
        "account",
        accountId,
        context.householdId,
      );
      const balance = cents(account.currentBalance, true) + delta;
      decimal(balance);
      const jars = await database.savingsGoal.findMany({
        where: { householdId: context.householdId, accountId },
        select: { currentAmount: true },
      });
      if (
        jars.reduce((sum, goal) => sum + cents(goal.currentAmount), 0) >
          Math.max(0, balance)
      ) {
        fail(
          409,
          "Release savings allocations before spending their backing account balance.",
        );
      }
      await database.account.updateMany({
        where: { id: accountId, householdId: context.householdId },
        data: { currentBalance: decimal(balance) },
      });
    }
  }
  async function createTransaction(database, context, payload, idempotencyKey) {
    const idempotencyHash = idempotencyKey
      ? crypto.createHash("sha256").update(JSON.stringify(payload)).digest(
        "hex",
      )
      : null;
    if (idempotencyKey) {
      const existing = await database.transaction.findFirst({
        where: { householdId: context.householdId, idempotencyKey },
      });
      if (existing) {
        if (
          existing.deletedAt || existing.idempotencyHash !== idempotencyHash
        ) {
          fail(
            409,
            "This request key was already used for a different or deleted entry. Reopen the form to start a new request.",
          );
        }
        return existing;
      }
    }
    const { data, splits } = await validateTransaction(
      database,
      context,
      payload,
    );
    await moveBalances(database, context, data);
    const transaction = await database.transaction.create({
      data: {
        ...data,
        idempotencyKey,
        idempotencyHash,
        splits: {
          create: splits.map((split) => ({
            ...split,
            householdId: context.householdId,
          })),
        },
      },
      include: { splits: true },
    });
    await audit(database, context, "TRANSACTION_CREATED", transaction.id, data);
    return transaction;
  }
  function requestKey(request) {
    const value = request.get("Idempotency-Key");
    if (!value) return null;
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(value)) {
      fail(422, "Invalid idempotency key.");
    }
    return crypto.createHash("sha256").update(
      `${request.context.householdId}:${value}`,
    ).digest("hex");
  }
  app.get(
    "/api/state",
    route(async (request, response) => {
      const context = request.context;
      const data = await prisma.$transaction(async (database) => {
        const where = { householdId: context.householdId };
        const [
          members,
          accounts,
          categories,
          sources,
          destinations,
          transactions,
          budgets,
          goals,
          recurring,
          settlements,
        ] = await Promise.all([
          database.householdMember.findMany({
            where,
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          }),
          database.account.findMany({ where }),
          database.category.findMany({ where }),
          database.incomeSource.findMany({ where }),
          database.payeeDestination.findMany({ where }),
          database.transaction.findMany({
            where: { ...where, deletedAt: null },
            include: { splits: true },
            orderBy: { transactedAt: "desc" },
          }),
          database.budget.findMany({ where }),
          database.savingsGoal.findMany({ where }),
          database.recurringSchedule.findMany({ where }),
          database.settlement.findMany({ where }),
        ]);
        return {
          household: context.household,
          currentMemberId: context.member.id,
          members,
          accounts,
          categories,
          sources,
          destinations,
          transactions,
          budgets,
          goals,
          recurring,
          settlements,
          clearing: clearingMatrix(transactions, settlements, members),
        };
      }, { isolationLevel: "RepeatableRead" });
      response.set("Cache-Control", "no-store").json(data);
    }),
  );
  app.get(
    "/api/transactions",
    route(async (request, response) => {
      const query = parse(
        z.object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          type: z.enum(["CREDIT", "DEBIT", "TRANSFER", "ADJUSTMENT"])
            .optional(),
          categoryId: id.optional(),
          memberId: id.optional(),
          start: date.optional(),
          end: date.optional(),
          search: z.string().max(120).optional(),
        }),
        request.query,
      );
      const where = { deletedAt: null };
      if (query.type) where.type = query.type;
      if (query.categoryId) where.categoryId = query.categoryId;
      if (query.memberId) where.createdById = query.memberId;
      if (query.start || query.end) {
        where.transactedAt = {
          ...(query.start ? { gte: query.start } : {}),
          ...(query.end
            ? { lt: new Date(query.end.getTime() + 86400000) }
            : {}),
        };
      }
      if (query.search) {
        where.OR = [{ notes: { contains: query.search } }, {
          source: { name: { contains: query.search } },
        }, { destination: { name: { contains: query.search } } }];
      }
      const [items, total, totals] = await Promise.all([
        request.context.db.transaction.findMany({
          where,
          include: { splits: true },
          orderBy: { transactedAt: "desc" },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        request.context.db.transaction.count({ where }),
        request.context.db.transaction.groupBy({
          by: ["type"],
          where,
          _sum: { amount: true },
        }),
      ]);
      response.json({ items, total, totals, page: query.page });
    }),
  );
  app.post(
    "/api/transactions",
    write,
    route(async (request, response) =>
      response.status(201).json(
        await atomic(request.context, (database) =>
          createTransaction(
            database,
            request.context,
            parse(transactionSchema, request.body),
            requestKey(request),
          )),
      )
    ),
  );
  app.post(
    "/api/transactions/import",
    write,
    route(async (request, response) => {
      const { items } = parse(
        z.object({ items: z.array(transactionSchema).min(1).max(500) })
          .strict(),
        request.body,
      );
      const batchKey = requestKey(request);
      if (!batchKey) {
        fail(422, "CSV imports require an Idempotency-Key header.");
      }
      const result = await atomic(request.context, async (database) => {
        const hash = crypto.createHash("sha256").update(JSON.stringify(items))
          .digest("hex");
        const batchId = `batch_${batchKey}`;
        const previous = await database.auditLog.findFirst({
          where: { id: batchId, householdId: request.context.householdId },
        });
        if (previous && previous.detail.hash !== hash) {
          fail(
            409,
            "This import key already belongs to a different CSV batch. Reopen the import dialog.",
          );
        }
        const created = [];
        for (let index = 0; index < items.length; index++) {
          const key = crypto.createHash("sha256").update(`${batchKey}:${index}`)
            .digest("hex");
          created.push(
            await createTransaction(
              database,
              request.context,
              items[index],
              key,
            ),
          );
        }
        if (!previous) {
          await database.auditLog.create({
            data: {
              id: batchId,
              householdId: request.context.householdId,
              actorId: request.context.member.id,
              action: "CSV_IMPORTED",
              entityId: batchId,
              detail: { hash, count: items.length },
            },
          });
        }
        return created;
      });
      response.status(201).json({ imported: result.length, items: result });
    }),
  );
  app.patch(
    "/api/transactions/:id",
    write,
    route(async (request, response) => {
      const payload = parse(transactionSchema, request.body);
      if (!payload.version) {
        fail(422, "The current record version is required.");
      }
      const context = request.context;
      const result = await atomic(context, async (database) => {
        const old = await owned(
          database,
          "transaction",
          request.params.id,
          context.householdId,
        );
        if (old.deletedAt || old.type === "ADJUSTMENT") {
          fail(409, "Deleted and reconciliation entries cannot be edited.");
        }
        if (
          context.member.role !== "ADMIN" &&
          old.createdById !== context.member.id
        ) {
          fail(403, "You can only edit your own transactions.");
        }
        if (old.version !== payload.version) {
          fail(409, "This entry changed. Refresh before editing it.");
        }
        const { data, splits } = await validateTransaction(
          database,
          context,
          payload,
        );
        await moveBalances(database, context, data, 1, old);
        await database.transactionSplit.deleteMany({
          where: { transactionId: old.id, householdId: context.householdId },
        });
        const updated = await database.transaction.update({
          where: { id: old.id, householdId: context.householdId },
          data: {
            ...data,
            version: { increment: 1 },
            splits: {
              create: splits.map((split) => ({
                ...split,
                householdId: context.householdId,
              })),
            },
          },
          include: { splits: true },
        });
        await audit(database, context, "TRANSACTION_EDITED", old.id, {
          before: old,
          after: data,
        });
        return updated;
      });
      response.json(result);
    }),
  );
  app.delete(
    "/api/transactions/:id",
    write,
    route(async (request, response) => {
      const { version } = parse(
        z.object({ version: z.number().int().positive() }).strict(),
        request.body,
      );
      const context = request.context;
      await atomic(context, async (database) => {
        const old = await owned(
          database,
          "transaction",
          request.params.id,
          context.householdId,
        );
        if (
          context.member.role !== "ADMIN" &&
          old.createdById !== context.member.id
        ) fail(403, "You can only delete your own transactions.");
        if (old.type === "ADJUSTMENT") {
          fail(409, "Use a new reconciliation to correct an adjustment.");
        }
        if (old.deletedAt || old.version !== version) {
          fail(409, "This transaction has changed. Refresh and retry.");
        }
        await moveBalances(database, context, old, -1);
        await database.transaction.updateMany({
          where: { id: old.id, householdId: context.householdId },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        await audit(database, context, "TRANSACTION_DELETED", old.id, old);
      });
      response.json({ ok: true });
    }),
  );
  const resourceSpecs = {
    sources: {
      model: "incomeSource",
      schema: z.object({
        name,
        isRecurring: z.boolean().default(false),
        taxTag: z.string().max(80).nullable().optional(),
      }).strict(),
    },
    destinations: {
      model: "payeeDestination",
      schema: z.object({ name, defaultCategoryId: optionalId }).strict(),
    },
    categories: {
      model: "category",
      adminOnly: true,
      schema: z.object({
        name,
        type: z.enum(["CREDIT", "DEBIT", "TRANSFER"]),
        colorCode: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#4F46E5"),
        essential: z.boolean().default(false),
      }).strict(),
    },
    accounts: {
      model: "account",
      adminOnly: true,
      schema: z.object({
        name,
        type: z.enum(["CHECKING", "SAVINGS", "CREDIT_CARD", "CASH_WALLET"]),
        openingBalance: signedMoney,
      }).strict(),
    },
    budgets: {
      model: "budget",
      adminOnly: true,
      schema: z.object({
        monthlyLimit: positiveMoney,
        periodMonth: z.number().int().min(1).max(12),
        periodYear: z.number().int().min(2000).max(2200),
        categoryId: id,
        rollover: z.boolean().default(false),
      }).strict(),
    },
    goals: {
      model: "savingsGoal",
      adminOnly: true,
      schema: z.object({
        name,
        targetAmount: positiveMoney,
        deadline: date.nullable().optional(),
        accountId: id,
      }).strict(),
    },
    recurring: {
      model: "recurringSchedule",
      schema: z.object({
        title: name,
        type: z.enum(["CREDIT", "DEBIT"]),
        amount: positiveMoney,
        frequency: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"]),
        nextDueDate: date,
        sourceOrPayee: name,
        template: transactionSchema,
        active: z.boolean().default(true),
      }).strict(),
    },
  };
  for (const [resource, specification] of Object.entries(resourceSpecs)) {
    const access = specification.adminOnly ? admin : write;
    const prepare = async (database, context, data, existing) => {
      if (data.categoryId || data.defaultCategoryId) {
        const category = await owned(
          database,
          "category",
          data.categoryId || data.defaultCategoryId,
          context.householdId,
        );
        if (category.type !== "DEBIT") fail(422, "Choose an expense category.");
      }
      if (data.accountId) {
        await owned(database, "account", data.accountId, context.householdId);
      }
      if (resource === "accounts") data.currentBalance = data.openingBalance;
      if (
        resource === "categories" && existing && existing.type !== data.type
      ) {
        const transactions = await database.transaction.count({
          where: { householdId: context.householdId, categoryId: existing.id },
        });
        const budgets = await database.budget.count({
          where: { householdId: context.householdId, categoryId: existing.id },
        });
        const vendors = await database.payeeDestination.count({
          where: {
            householdId: context.householdId,
            defaultCategoryId: existing.id,
          },
        });
        const schedules = await database.recurringSchedule.findMany({
          where: { householdId: context.householdId },
        });
        if (
          transactions || budgets || vendors ||
          schedules.some((rule) => rule.template.categoryId === existing.id)
        ) {
          fail(
            409,
            "A referenced category cannot change accounting direction. Create a new category instead.",
          );
        }
      }
      if (
        resource === "goals" && existing &&
        cents(existing.currentAmount) > cents(data.targetAmount)
      ) fail(422, "Target cannot be below the currently allocated amount.");
      if (
        resource === "goals" && existing &&
        existing.accountId !== data.accountId && cents(existing.currentAmount)
      ) {
        fail(
          422,
          "Release the allocation before changing its backing account.",
        );
      }
      if (resource === "recurring") {
        const template = {
          ...data.template,
          type: data.type,
          amount: data.amount,
          transactedAt: data.nextDueDate,
        };
        await validateTransaction(database, context, template);
        data.template = JSON.parse(JSON.stringify(template));
        data.anchorDay = data.nextDueDate.getUTCDate();
        data.lastReviewedAt = new Date();
      }
      return data;
    };
    app.post(
      `/api/${resource}`,
      access,
      route(async (request, response) => {
        const data = parse(specification.schema, request.body);
        const result = await atomic(request.context, async (database) => {
          const prepared = await prepare(database, request.context, data);
          const created = await database[specification.model].create({
            data: { ...prepared, householdId: request.context.householdId },
          });
          await audit(
            database,
            request.context,
            `${resource.toUpperCase()}_CREATED`,
            created.id,
            prepared,
          );
          return created;
        });
        response.status(201).json(result);
      }),
    );
    if (resource !== "accounts") {
      app.patch(
        `/api/${resource}/:id`,
        access,
        route(async (request, response) => {
          const data = parse(specification.schema, request.body);
          const result = await atomic(request.context, async (database) => {
            const existing = await owned(
              database,
              specification.model,
              request.params.id,
              request.context.householdId,
            );
            const prepared = await prepare(
              database,
              request.context,
              data,
              existing,
            );
            const updated = await database[specification.model].update({
              where: {
                id: existing.id,
                householdId: request.context.householdId,
              },
              data: prepared,
            });
            await audit(
              database,
              request.context,
              `${resource.toUpperCase()}_EDITED`,
              updated.id,
              prepared,
            );
            return updated;
          });
          response.json(result);
        }),
      );
    }
    app.delete(
      `/api/${resource}/:id`,
      access,
      route(async (request, response) => {
        await atomic(request.context, async (database) => {
          const existing = await owned(
            database,
            specification.model,
            request.params.id,
            request.context.householdId,
          );
          if (resource === "goals" && cents(existing.currentAmount)) {
            fail(409, "Release all allocations before removing this goal.");
          }
          const templates = await database.recurringSchedule.findMany({
            where: { householdId: request.context.householdId },
          });
          if (
            resource !== "recurring" &&
            templates.some((rule) =>
              Object.values(rule.template).includes(existing.id)
            )
          ) {
            fail(409, "This record is referenced by a recurring schedule.");
          }
          await database[specification.model].delete({
            where: {
              id: existing.id,
              householdId: request.context.householdId,
            },
          });
          await audit(
            database,
            request.context,
            `${resource.toUpperCase()}_DELETED`,
            existing.id,
          );
        });
        response.json({ ok: true });
      }),
    );
  }
  app.post(
    "/api/destinations/merge",
    admin,
    route(async (request, response) => {
      const { fromId, toId } = parse(
        z.object({ fromId: id, toId: id }).strict(),
        request.body,
      );
      if (fromId === toId) fail(422, "Choose two distinct vendors.");
      await atomic(request.context, async (database) => {
        const householdId = request.context.householdId;
        await owned(database, "payeeDestination", fromId, householdId);
        const target = await owned(
          database,
          "payeeDestination",
          toId,
          householdId,
        );
        await database.transaction.updateMany({
          where: { householdId, destinationId: fromId },
          data: { destinationId: toId, version: { increment: 1 } },
        });
        const rules = await database.recurringSchedule.findMany({
          where: { householdId },
        });
        for (const rule of rules) {
          if (rule.template.destinationId === fromId) {
            await database.recurringSchedule.updateMany({
              where: { id: rule.id, householdId },
              data: {
                template: { ...rule.template, destinationId: toId },
                sourceOrPayee: target.name,
              },
            });
          }
        }
        await database.payeeDestination.delete({
          where: { id: fromId, householdId },
        });
        await audit(database, request.context, "DESTINATIONS_MERGED", toId, {
          fromId,
          toId,
        });
      });
      response.json({ ok: true });
    }),
  );
  app.post(
    "/api/goals/:id/contribute",
    write,
    route(async (request, response) => {
      const { amount } = parse(
        z.object({ amount: signedMoney }).strict(),
        request.body,
      );
      const result = await atomic(request.context, async (database) => {
        const householdId = request.context.householdId;
        const goal = await owned(
          database,
          "savingsGoal",
          request.params.id,
          householdId,
        );
        const account = await owned(
          database,
          "account",
          goal.accountId,
          householdId,
        );
        const current = cents(goal.currentAmount) + cents(amount, true);
        if (current < 0 || current > cents(goal.targetAmount)) {
          fail(422, "Allocation must stay between zero and the goal target.");
        }
        const jars = await database.savingsGoal.findMany({
          where: { householdId, accountId: goal.accountId },
        });
        const reserved = jars.reduce((sum, jar) =>
          sum + cents(jar.currentAmount), 0) + cents(amount, true);
        if (reserved > Math.max(0, cents(account.currentBalance, true))) {
          fail(409, "Not enough unallocated money in the backing account.");
        }
        const updated = await database.savingsGoal.update({
          where: { id: goal.id, householdId },
          data: { currentAmount: decimal(current) },
        });
        await audit(database, request.context, "GOAL_ALLOCATION", goal.id, {
          amount,
        });
        return updated;
      });
      response.json(result);
    }),
  );
  app.post(
    "/api/budgets/rollover",
    admin,
    route(async (request, response) => {
      const { periodMonth, periodYear, goalId } = parse(
        z.object({
          periodMonth: z.number().int().min(1).max(12),
          periodYear: z.number().int().min(2000).max(2200),
          goalId: id.optional(),
        }).strict(),
        request.body,
      );
      const result = await atomic(request.context, async (database) => {
        const householdId = request.context.householdId;
        const budgets = await database.budget.findMany({
          where: { householdId, periodMonth, periodYear },
        });
        const startDate = new Date(Date.UTC(periodYear, periodMonth - 1, 1)),
          nextDate = new Date(Date.UTC(periodYear, periodMonth, 1));
        const nextMonth = nextDate.getUTCMonth() + 1,
          nextYear = nextDate.getUTCFullYear();
        const transactions = await database.transaction.findMany({
          where: {
            householdId,
            type: "DEBIT",
            deletedAt: null,
            transactedAt: { gte: startDate, lt: nextDate },
          },
        });
        let surplus = 0;
        for (const budget of budgets) {
          if (
            await database.budget.findFirst({
              where: {
                householdId,
                categoryId: budget.categoryId,
                periodMonth: nextMonth,
                periodYear: nextYear,
              },
            })
          ) continue;
          const spent = transactions.filter((transaction) =>
            transaction.categoryId === budget.categoryId
          ).reduce((sum, transaction) => sum + cents(transaction.amount), 0);
          const available = Math.max(0, cents(budget.monthlyLimit) - spent);
          if (!budget.rollover) surplus += available;
          await database.budget.create({
            data: {
              householdId,
              categoryId: budget.categoryId,
              monthlyLimit: decimal(
                cents(budget.monthlyLimit) + (budget.rollover ? available : 0),
              ),
              periodMonth: nextMonth,
              periodYear: nextYear,
              rollover: budget.rollover,
            },
          });
        }
        if (goalId && surplus) {
          const goal = await owned(
              database,
              "savingsGoal",
              goalId,
              householdId,
            ),
            account = await owned(
              database,
              "account",
              goal.accountId,
              householdId,
            );
          const jars = await database.savingsGoal.findMany({
            where: { householdId, accountId: goal.accountId },
          });
          const reserved = jars.reduce(
            (sum, jar) => sum + cents(jar.currentAmount),
            0,
          );
          const allocation = Math.min(
            surplus,
            cents(goal.targetAmount) - cents(goal.currentAmount),
            Math.max(0, cents(account.currentBalance, true) - reserved),
          );
          await database.savingsGoal.update({
            where: { id: goalId, householdId },
            data: {
              currentAmount: decimal(cents(goal.currentAmount) + allocation),
            },
          });
        }
        await audit(database, request.context, "BUDGET_ROLLOVER", householdId, {
          periodMonth,
          periodYear,
          surplus: decimal(surplus),
          goalId: goalId || null,
        });
        return { nextMonth, nextYear, surplus: decimal(surplus) };
      });
      response.json(result);
    }),
  );
  app.post(
    "/api/recurring/:id/post",
    write,
    route(async (request, response) => {
      const { dueDate } = parse(
        z.object({ dueDate: date }).strict(),
        request.body,
      );
      const result = await atomic(request.context, async (database) => {
        const context = request.context,
          rule = await owned(
            database,
            "recurringSchedule",
            request.params.id,
            context.householdId,
          );
        const key = crypto.createHash("sha256").update(
          `${context.householdId}:recurring:${rule.id}:${dueDate.toISOString()}`,
        ).digest("hex");
        const existing = await database.transaction.findFirst({
          where: { householdId: context.householdId, idempotencyKey: key },
        });
        if (existing) {
          if (existing.deletedAt) {
            fail(
              409,
              "This occurrence was deleted. Review the ledger before posting a replacement.",
            );
          }
          return existing;
        }
        if (
          !rule.active || rule.nextDueDate.getTime() !== dueDate.getTime()
        ) fail(409, "This schedule has changed. Refresh before posting.");
        const payload = parse(transactionSchema, {
          ...rule.template,
          amount: String(rule.amount),
          type: rule.type,
          transactedAt: dueDate.toISOString(),
        });
        const transaction = await createTransaction(
          database,
          context,
          payload,
          key,
        );
        await database.recurringSchedule.updateMany({
          where: { id: rule.id, householdId: context.householdId },
          data: {
            nextDueDate: nextOccurrence(
              rule.nextDueDate,
              rule.frequency,
              rule.anchorDay,
            ),
          },
        });
        return transaction;
      });
      response.status(201).json(result);
    }),
  );
  app.post(
    "/api/recurring/:id/review",
    write,
    route(async (request, response) => {
      await atomic(request.context, async (database) => {
        const rule = await owned(
          database,
          "recurringSchedule",
          request.params.id,
          request.context.householdId,
        );
        await database.recurringSchedule.updateMany({
          where: { id: rule.id, householdId: request.context.householdId },
          data: { lastReviewedAt: new Date() },
        });
        await audit(
          database,
          request.context,
          "SUBSCRIPTION_REVIEWED",
          rule.id,
        );
      });
      response.json({ ok: true });
    }),
  );
  app.post(
    "/api/settlements",
    write,
    route(async (request, response) => {
      const payload = parse(
        z.object({
          fromMemberId: id,
          toMemberId: id,
          amount: positiveMoney,
          notes: z.string().max(300).optional(),
        }).strict(),
        request.body,
      );
      const result = await atomic(request.context, async (database) => {
        const context = request.context;
        if (
          context.member.role !== "ADMIN" &&
          payload.fromMemberId !== context.member.id
        ) {
          fail(
            403,
            "Only the paying member or an admin can confirm settlement.",
          );
        }
        const where = { householdId: context.householdId },
          members = await database.householdMember.findMany({ where });
        if (
          payload.fromMemberId === payload.toMemberId ||
          !members.some((member) => member.id === payload.fromMemberId) ||
          !members.some((member) => member.id === payload.toMemberId)
        ) fail(422, "Select two different household members.");
        const transactions = await database.transaction.findMany({
            where: { ...where, deletedAt: null },
            include: { splits: true },
          }),
          settlements = await database.settlement.findMany({ where });
        const clearing = clearingMatrix(transactions, settlements, members);
        const from = cents(clearing.balances[payload.fromMemberId], true),
          to = cents(clearing.balances[payload.toMemberId], true);
        if (
          from >= 0 || to <= 0 || cents(payload.amount) > Math.min(-from, to)
        ) fail(422, "Settlement exceeds the outstanding member balance.");
        const created = await database.settlement.create({
          data: { ...payload, householdId: context.householdId },
        });
        await audit(
          database,
          context,
          "SETTLEMENT_CONFIRMED",
          created.id,
          payload,
        );
        return created;
      });
      response.status(201).json(result);
    }),
  );
  app.post(
    "/api/accounts/:id/reconcile",
    admin,
    route(async (request, response) => {
      const { statementBalance, expectedBalance, notes } = parse(
        z.object({
          statementBalance: signedMoney,
          expectedBalance: signedMoney,
          notes: z.string().max(3000).default("Statement reconciliation"),
        }).strict(),
        request.body,
      );
      const result = await atomic(request.context, async (database) => {
        const context = request.context,
          account = await owned(
            database,
            "account",
            request.params.id,
            context.householdId,
          );
        if (
          cents(account.currentBalance, true) !== cents(expectedBalance, true)
        ) {
          fail(
            409,
            "Account balance changed. Review the current ledger and retry.",
          );
        }
        const difference = cents(statementBalance, true) -
          cents(account.currentBalance, true);
        if (difference) {
          const category = await database.category.findFirst({
            where: { householdId: context.householdId, type: "ADJUSTMENT" },
          });
          if (!category) fail(409, "Reconciliation category is missing.");
          const data = {
            householdId: context.householdId,
            type: "ADJUSTMENT",
            amount: decimal(difference),
            categoryId: category.id,
            toAccountId: account.id,
            createdById: context.member.id,
            transactedAt: new Date(),
            allocationType: "SHARED",
            notes,
          };
          await moveBalances(database, context, data);
          await database.transaction.create({ data });
        }
        await database.account.updateMany({
          where: { id: account.id, householdId: context.householdId },
          data: { lastReconciledAt: new Date() },
        });
        await audit(database, context, "ACCOUNT_RECONCILED", account.id, {
          statementBalance,
          difference: decimal(difference),
          notes,
        });
        return {
          difference: decimal(difference),
          currentBalance: statementBalance,
        };
      });
      response.json(result);
    }),
  );
  app.post(
    "/api/members",
    admin,
    route(async (request, response) => {
      const { email, role } = parse(
        z.object({
          email: z.string().email().transform((value) => value.toLowerCase()),
          role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
        }).strict(),
        request.body,
      );
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        fail(
          404,
          "This person must register an account before joining the household.",
        );
      }
      response.status(201).json(
        await atomic(request.context, async (database) => {
          const member = await database.householdMember.create({
            data: {
              userId: user.id,
              householdId: request.context.householdId,
              role,
            },
          });
          await audit(database, request.context, "MEMBER_ADDED", member.id, {
            email,
            role,
          });
          return member;
        }),
      );
    }),
  );
  app.patch(
    "/api/members/:id",
    admin,
    route(async (request, response) => {
      const { role } = parse(
        z.object({ role: z.enum(["ADMIN", "MEMBER", "VIEWER"]) }).strict(),
        request.body,
      );
      await atomic(request.context, async (database) => {
        const member = await owned(
          database,
          "householdMember",
          request.params.id,
          request.context.householdId,
        );
        if (
          member.role === "ADMIN" && role !== "ADMIN" &&
          await database.householdMember.count({
              where: {
                householdId: request.context.householdId,
                role: "ADMIN",
              },
            }) <= 1
        ) fail(409, "A household must retain at least one administrator.");
        await database.householdMember.updateMany({
          where: { id: member.id, householdId: request.context.householdId },
          data: { role },
        });
        await audit(
          database,
          request.context,
          "MEMBER_ROLE_CHANGED",
          member.id,
          { role },
        );
      });
      response.json({ ok: true });
    }),
  );
  app.get(
    "/api/audit",
    admin,
    route(async (request, response) =>
      response.json(
        await request.context.db.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
      )
    ),
  );
  app.use(
    "/api",
    (request, response) =>
      response.status(404).json({ error: "API endpoint not found." }),
  );
  const clientDist = path.resolve(__dirname, "../client/dist");
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((request, response, next) => {
      if (request.method !== "GET" && request.method !== "HEAD") return next();
      if (request.path.startsWith("/api")) return next();
      response.sendFile(path.join(clientDist, "index.html"));
    });
  } else {
    app.get("/", (request, response) => {
      const rootIndex = path.resolve(__dirname, "../index.html");
      const localSingle = path.resolve(__dirname, "single.html");
      const filename = fs.existsSync(rootIndex) ? rootIndex : (fs.existsSync(localSingle) ? localSingle : "main.tex");
      if (!fs.existsSync(filename)) {
        return response.status(404).send(
          "Client build not found. Run 'npm run build' in client/ or place index.html beside the server.",
        );
      }
      response.type("html").send(fs.readFileSync(filename, "utf8"));
    });
  }
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (error instanceof z.ZodError) {
      return response.status(422).json({
        error: error.issues.map((issue) =>
          `${issue.path.join(".")}: ${issue.message}`
        ).join("; "),
      });
    }
    if (error instanceof HttpError) {
      return response.status(error.status).json({ error: error.message });
    }
    if (error.code === "P2002") {
      return response.status(409).json({
        error: "A record with this unique value already exists.",
      });
    }
    if (error.code === "P2003") {
      return response.status(409).json({
        error: "This record is referenced by the ledger and cannot be removed.",
      });
    }
    if (error.code === "P2025") {
      return response.status(404).json({
        error: "Record not found in this household.",
      });
    }
    if (error.type === "entity.too.large") {
      return response.status(413).json({ error: "Request exceeds 2 MB." });
    }
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({ error: "Malformed JSON body." });
    }
    console.error(
      JSON.stringify({
        event: "request_error",
        method: request.method,
        path: request.path,
        message: error.message,
        code: error.code,
      }),
    );
    response.status(500).json({
      error: "Request failed. No partial financial changes were committed.",
    });
  });
  const server = app.listen(
    Number(process.env.PORT || 3000),
    () =>
      console.log(
        `Household API listening on port ${process.env.PORT || 3000}`,
      ),
  );
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    });
  }
  return { app, prisma, server };
}
module.exports = {
  PRISMA_SCHEMA,
  cents,
  decimal,
  splitAmounts,
  nextOccurrence,
  clearingMatrix,
  HttpError,
  start,
};
if (require.main === module) {
  if (process.argv.includes("--init")) {
    fs.mkdirSync(path.join(__dirname, "prisma"), { recursive: true });
    fs.writeFileSync(
      path.join(__dirname, "prisma", "schema.prisma"),
      PRISMA_SCHEMA.trim() + "\n",
      { flag: "wx" },
    );
    console.log(
      "Created prisma/schema.prisma. Configure DATABASE_URL, then migrate and generate.",
    );
  } else {start().catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });}
}