import './index.css';
import ChartJS from 'chart.js/auto';
if (typeof window !== 'undefined') {
  window.Chart = ChartJS;
}
import React, {
      useCallback,
      useEffect,
      useMemo,
      useRef,
      useState,
    } from "react";
    import { createRoot } from "react-dom/client";
    import {
      QueryClient,
      QueryClientProvider,
      useMutation,
      useQuery,
      useQueryClient,
    } from "@tanstack/react-query";
    import {
      flexRender,
      getCoreRowModel,
      getPaginationRowModel,
      getSortedRowModel,
      useReactTable,
    } from "@tanstack/react-table";
    import { useForm } from "react-hook-form";
    import { z } from "zod";
    import {
      addMonths,
      differenceInCalendarMonths,
      format,
    } from "date-fns";
    import {
      ArrowDownLeft,
      ArrowLeftRight,
      ArrowRight,
      ArrowUpRight,
      Bell,
      BriefcaseBusiness,
      Building2,
      CalendarDays,
      ChartNoAxesCombined,
      Check,
      CheckCheck,
      ChevronDown,
      ChevronLeft,
      ChevronRight,
      CircleAlert,
      CircleCheck,
      Coffee,
      Copy,
      CreditCard,
      Download,
      ExternalLink,
      FileText,
      FolderPlus,
      House,
      Landmark,
      LayoutDashboard,
      LockKeyhole,
      LogOut,
      Mail,
      Menu,
      Moon,
      MoreHorizontal,
      PanelLeftClose,
      Pencil,
      PiggyBank,
      Plus,
      Receipt,
      RefreshCw,
      Search,
      Settings,
      ShieldCheck,
      ShoppingBag,
      SlidersHorizontal,
      Sparkles,
      Sun,
      Target,
      Trash2,
      TrendingDown,
      TrendingUp,
      Upload,
      Users,
      Wallet,
      X,
      Zap,
    } from "lucide-react";

    const STORAGE = "household.demo.v1";
    const PAGES = [
      ["dashboard", "Overview", LayoutDashboard, "Your household, at a glance."],
      [
        "transactions",
        "Transactions",
        ArrowLeftRight,
        "Every movement. A clear record.",
      ],
      [
        "credits",
        "Income sources",
        TrendingUp,
        "Know exactly where your money comes from.",
      ],
      [
        "debits",
        "Expenses & vendors",
        TrendingDown,
        "A closer look at where your money goes.",
      ],
      ["budgets", "Budgets", Wallet, "Give every dollar a purpose."],
      [
        "recurring",
        "Recurring bills",
        CalendarDays,
        "Stay one step ahead of your obligations.",
      ],
      [
        "family-splits",
        "Family & splits",
        Users,
        "Shared expenses, fairly settled.",
      ],
      [
        "savings-goals",
        "Savings goals",
        Target,
        "Make room for what matters next.",
      ],
      [
        "analytics",
        "Analytics",
        ChartNoAxesCombined,
        "Turn your financial history into clarity.",
      ],
      ["accounts", "Accounts & vaults", Landmark, "All your money, in one place."],
    ];
    const COLORS = [
      "#7186d5",
      "#64b9a3",
      "#efbb77",
      "#b18bcd",
      "#7cb4ce",
      "#dc929e",
      "#97b0a5",
    ];
    const todayISO = () => format(new Date(), "yyyy-MM-dd");
    const monthISO = () => format(new Date(), "yyyy-MM");
    const uid = () =>
      crypto.randomUUID
        ? crypto.randomUUID()
        : `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    function toCents(value, signed = true) {
      const text = String(value);
      if (
        !(signed ? /^-?\d{1,10}(\.\d{1,2})?$/ : /^\d{1,10}(\.\d{1,2})?$/).test(text)
      ) throw new Error("Enter a valid amount with at most two decimal places.");
      const [whole, fraction = ""] = text.replace("-", "").split(".");
      const result = (Number(whole) * 100 + Number(fraction.padEnd(2, "0"))) *
        (text.startsWith("-") ? -1 : 1);
      if (!Number.isSafeInteger(result) || Math.abs(result) > 999999999999) {
        throw new Error("Amount is out of range.");
      }
      return result;
    }
    const asDecimal = (value) => {
      if (!Number.isSafeInteger(value) || Math.abs(value) > 999999999999) {
        throw new Error("Balance is out of range.");
      }
      return `${value < 0 ? "-" : ""}${Math.floor(Math.abs(value) / 100)}.${
        String(Math.abs(value) % 100).padStart(2, "0")
      }`;
    };
    const sumMoney = (items, field = "amount") =>
      items.reduce((total, item) => total + toCents(item[field]), 0);
    const dateLabel = (date) =>
      format(new Date(String(date).slice(0, 10) + "T12:00:00"), "MMM d, yyyy");
    const inMonth = (date, month) => String(date).slice(0, 7) === month;
    const fullName = (member) =>
      `${member?.user?.firstName || "Member"} ${member?.user?.lastName || ""}`
        .trim();
    const initials = (member) =>
      `${member?.user?.firstName?.[0] || "?"}${member?.user?.lastName?.[0] || ""}`;
    const lookup = (items, id) => items.find((item) => item.id === id);
    function distribute(amount, strategy, entries, members) {
      if (
        !entries.length ||
        new Set(entries.map((entry) => entry.memberId)).size !== entries.length ||
        entries.some((entry) =>
          !members.some((member) => member.id === entry.memberId)
        )
      ) throw new Error("Choose unique household members for the split.");
      let portions;
      if (strategy === "EQUAL") {
        portions = entries.map((entry, index) =>
          Math.floor(amount / entries.length) +
          (index < amount % entries.length ? 1 : 0)
        );
      } else if (strategy === "EXACT_AMOUNT") {
        portions = entries.map((entry) => toCents(entry.value, false));
        if (portions.reduce((total, value) => total + value, 0) !== amount) {
          throw new Error("Split amounts must add up to the transaction amount.");
        }
      } else if (strategy === "PERCENTAGE") {
        const weights = entries.map((entry) => toCents(entry.value, false));
        if (weights.reduce((total, value) => total + value, 0) !== 10000) {
          throw new Error("Percentages must add up to 100.00.");
        }
        const raw = weights.map((weight) => BigInt(amount) * BigInt(weight));
        portions = raw.map((value) => Number(value / 10000n));
        const order = raw.map((value, index) => ({
          index,
          remainder: value % 10000n,
        })).sort((left, right) =>
          left.remainder === right.remainder
            ? left.index - right.index
            : left.remainder > right.remainder
            ? -1
            : 1
        );
        const remaining = amount -
          portions.reduce((total, value) => total + value, 0);
        for (let index = 0; index < remaining; index++) {
          portions[order[index].index]++;
        }
      } else throw new Error("Choose a split strategy.");
      return entries.map((entry, index) => ({
        memberId: entry.memberId,
        amount: asDecimal(portions[index]),
      }));
    }
    function clearing(state) {
      const balances = Object.fromEntries(
        state.members.map((member) => [member.id, 0]),
      );
      for (const transaction of state.transactions) {
        if (
          !transaction.deletedAt && transaction.type === "DEBIT" &&
          transaction.allocationType === "SPLIT"
        ) {
          for (const split of transaction.splits || []) {
            if (split.memberId !== transaction.createdById) {
              balances[split.memberId] -= toCents(split.amount);
              balances[transaction.createdById] += toCents(split.amount);
            }
          }
        }
      }
      for (const settlement of state.settlements) {
        balances[settlement.fromMemberId] += toCents(settlement.amount);
        balances[settlement.toMemberId] -= toCents(settlement.amount);
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
              amount: asDecimal(amount),
            });
            debtor.amount -= amount;
            creditor.amount -= amount;
          }
        }
      }
      return { balances, transfers };
    }
    function advanceDate(date, frequency, anchorDay) {
      const next = new Date(String(date).slice(0, 10) + "T00:00:00Z");
      if (frequency === "WEEKLY") next.setUTCDate(next.getUTCDate() + 7);
      else {
        const increment = { MONTHLY: 1, QUARTERLY: 3, ANNUALLY: 12 }[frequency];
        if (!increment) throw new Error("Invalid recurrence.");
        const desired = anchorDay || next.getUTCDate();
        next.setUTCDate(1);
        next.setUTCMonth(next.getUTCMonth() + increment);
        next.setUTCDate(
          Math.min(
            desired,
            new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0))
              .getUTCDate(),
          ),
        );
      }
      return next.toISOString();
    }
    function seedDemo() {
      const now = new Date(), month = monthISO();
      const categories = [
        ["salary", "Salary & Wages", "CREDIT", "#169979", false],
        ["freelance", "Freelance", "CREDIT", "#64b9a3", false],
        ["gifts", "Gifts & Returns", "CREDIT", "#7cb4ce", false],
        ["housing", "Housing", "DEBIT", COLORS[0], true],
        ["groceries", "Groceries", "DEBIT", COLORS[1], true],
        ["utilities", "Home & Utilities", "DEBIT", COLORS[2], true],
        ["dining", "Dining & Coffee", "DEBIT", COLORS[3], false],
        ["transport", "Transport", "DEBIT", COLORS[4], true],
        ["subscriptions", "Subscriptions", "DEBIT", COLORS[5], false],
        ["shopping", "Shopping", "DEBIT", COLORS[6], false],
        ["transfer", "Internal Transfer", "TRANSFER", "#94a3b8", false],
        ["adjustment", "Reconciliation", "ADJUSTMENT", "#94a3b8", false],
      ].map(([id, name, type, colorCode, essential]) => ({
        id,
        name,
        type,
        colorCode,
        essential,
      }));
      const sources = [{
        id: "starlight",
        name: "Starlight Tech Inc.",
        isRecurring: true,
        taxTag: "W-2 payroll",
      }, {
        id: "studio",
        name: "Northstar Studio",
        isRecurring: true,
        taxTag: "1099 freelance",
      }, {
        id: "returns",
        name: "Refunds & gifts",
        isRecurring: false,
        taxTag: null,
      }];
      const destinations = [
        ["rent", "Oakwood Properties", "housing"],
        ["market", "Trader Joe’s", "groceries"],
        ["electric", "Metro Electric", "utilities"],
        ["internet", "Fiber Home", "utilities"],
        ["coffee", "Sunday Coffee", "dining"],
        ["restaurant", "The Green Table", "dining"],
        ["metro", "City Transit", "transport"],
        ["netflix", "Netflix", "subscriptions"],
        ["spotify", "Spotify", "subscriptions"],
        ["amazon", "Amazon", "shopping"],
        ["costco", "Costco", "groceries"],
      ].map(([id, name, defaultCategoryId]) => ({ id, name, defaultCategoryId }));
      const members = [{
        id: "alex",
        role: "ADMIN",
        user: { firstName: "Alex", lastName: "Morgan", email: "alex@example.com" },
      }, {
        id: "jordan",
        role: "MEMBER",
        user: {
          firstName: "Jordan",
          lastName: "Morgan",
          email: "jordan@example.com",
        },
      }];
      const accounts = [{
        id: "checking",
        name: "Joint Checking",
        type: "CHECKING",
        openingBalance: "2000.00",
        currentBalance: "2000.00",
        lastReconciledAt: new Date(now.getTime() - 86400000 * 5).toISOString(),
      }, {
        id: "savings",
        name: "Family Savings",
        type: "SAVINGS",
        openingBalance: "15200.00",
        currentBalance: "15200.00",
        lastReconciledAt: new Date(now.getTime() - 86400000 * 12).toISOString(),
      }, {
        id: "cash",
        name: "Cash Wallet",
        type: "CASH_WALLET",
        openingBalance: "340.00",
        currentBalance: "340.00",
        lastReconciledAt: null,
      }];
      const transactions = [];
      for (let offset = 11; offset >= 0; offset--) {
        const base = addMonths(
          new Date(now.getFullYear(), now.getMonth(), 1),
          -offset,
        );
        const prefix = format(base, "yyyy-MM");
        const push = (
          day,
          type,
          amount,
          categoryId,
          entityId,
          notes,
          member = "alex",
          split = false,
        ) => {
          const transactedAt = `${prefix}-${
            String(day).padStart(2, "0")
          }T12:00:00.000Z`;
          if (String(transactedAt).slice(0, 10) > todayISO()) return;
          transactions.push({
            id: `demo_${offset}_${transactions.length}`,
            type,
            amount: String(amount),
            categoryId,
            sourceId: type === "CREDIT" ? entityId : null,
            destinationId: type === "DEBIT" ? entityId : null,
            fromAccountId: type === "DEBIT" ? "checking" : null,
            toAccountId: type === "CREDIT" ? "checking" : null,
            transactedAt,
            notes,
            createdById: member,
            allocationType: split ? "SPLIT" : "SHARED",
            splitStrategy: split ? "EQUAL" : "SOLE_RESPONSIBILITY",
            splits: split
              ? distribute(
                toCents(amount),
                "EQUAL",
                members.map((member) => ({ memberId: member.id })),
                members,
              )
              : [],
            version: 1,
            receiptUrl: null,
          });
        };
        push(1, "CREDIT", "4250.00", "salary", "starlight", "Monthly salary");
        push(2, "DEBIT", "2100.00", "housing", "rent", "Home, sweet home");
        push(
          3,
          "DEBIT",
          "127.48",
          "groceries",
          "market",
          "Weekly groceries",
          "jordan",
        );
        push(5, "DEBIT", "184.20", "utilities", "electric", "Electricity bill");
        push(6, "DEBIT", "79.00", "utilities", "internet", "Home broadband");
        push(7, "DEBIT", "15.49", "subscriptions", "netflix", "Family streaming");
        push(
          9,
          "DEBIT",
          asDecimal(9400 + offset * 110),
          "dining",
          "restaurant",
          "Dinner together",
          "alex",
          true,
        );
        push(
          10,
          "CREDIT",
          asDecimal(128000 + offset * 4200),
          "freelance",
          "studio",
          "Design retainer",
          "jordan",
        );
        push(12, "DEBIT", "116.00", "transport", "metro", "Monthly transit pass");
        push(
          14,
          "DEBIT",
          "238.60",
          "groceries",
          "costco",
          "Pantry essentials",
          "jordan",
        );
        push(
          15,
          "CREDIT",
          "2750.00",
          "salary",
          "starlight",
          "Second household salary",
          "jordan",
        );
        push(
          17,
          "DEBIT",
          "12.99",
          "subscriptions",
          "spotify",
          "Music subscription",
        );
        push(
          19,
          "DEBIT",
          "149.90",
          "shopping",
          "amazon",
          "Home supplies",
          "alex",
          true,
        );
        push(
          22,
          "DEBIT",
          "152.33",
          "groceries",
          "market",
          "Fresh groceries",
          "jordan",
        );
        push(24, "DEBIT", "38.50", "dining", "coffee", "Weekend coffee");
        push(
          27,
          "DEBIT",
          "178.20",
          "dining",
          "restaurant",
          "Family celebration",
          "jordan",
          true,
        );
        push(28, "DEBIT", "135.62", "groceries", "market", "Weekly groceries");
      }
      const totalMovement = transactions.reduce(
        (total, transaction) =>
          total +
          (transaction.type === "CREDIT" ? 1 : -1) * toCents(transaction.amount),
        0,
      );
      accounts[0].openingBalance = asDecimal(1128400 - totalMovement);
      accounts[0].currentBalance = "11284.00";
      const budgets = [
        ["housing", "2300.00"],
        ["groceries", "800.00"],
        ["utilities", "350.00"],
        ["dining", "400.00"],
        ["transport", "250.00"],
        ["subscriptions", "80.00"],
        ["shopping", "300.00"],
      ].map(([categoryId, monthlyLimit], index) => ({
        id: `budget_${index}`,
        categoryId,
        monthlyLimit,
        periodMonth: now.getMonth() + 1,
        periodYear: now.getFullYear(),
        rollover: index === 1,
      }));
      const goals = [{
        id: "emergency",
        name: "Emergency fund",
        targetAmount: "15000.00",
        currentAmount: "9800.00",
        accountId: "savings",
        deadline: format(addMonths(now, 9), "yyyy-MM-dd"),
      }, {
        id: "holiday",
        name: "Summer in Portugal",
        targetAmount: "5000.00",
        currentAmount: "2400.00",
        accountId: "savings",
        deadline: format(addMonths(now, 7), "yyyy-MM-dd"),
      }, {
        id: "home",
        name: "Home refresh",
        targetAmount: "3000.00",
        currentAmount: "900.00",
        accountId: "savings",
        deadline: format(addMonths(now, 5), "yyyy-MM-dd"),
      }];
      const recurring = [
        ["rent", "Monthly rent", "2100.00", 2],
        ["electric", "Electricity", "184.20", 5],
        ["netflix", "Netflix Family", "15.49", 7],
        ["spotify", "Spotify Duo", "12.99", 17],
      ].map(([destinationId, title, amount, day], index) => {
        const nextBase = now.getDate() >= day ? addMonths(now, 1) : now;
        const nextDueDate = `${format(nextBase, "yyyy-MM")}-${
          String(day).padStart(2, "0")
        }T12:00:00.000Z`;
        const payee = lookup(destinations, destinationId);
        return {
          id: `recurring_${index}`,
          title,
          amount,
          type: "DEBIT",
          frequency: "MONTHLY",
          nextDueDate,
          anchorDay: day,
          active: true,
          lastReviewedAt: format(
            addMonths(now, index >= 2 ? -8 : -1),
            "yyyy-MM-dd",
          ),
          sourceOrPayee: payee.name,
          template: {
            type: "DEBIT",
            amount,
            transactedAt: nextDueDate,
            categoryId: payee.defaultCategoryId,
            destinationId,
            sourceId: null,
            fromAccountId: "checking",
            toAccountId: null,
            createdById: "alex",
            allocationType: "SHARED",
            splitStrategy: "SOLE_RESPONSIBILITY",
            splits: [],
            notes: title,
          },
        };
      });
      const state = {
        schemaVersion: 1,
        household: { id: "demo", name: "Morgan household", currency: "USD" },
        currentMemberId: "alex",
        members,
        accounts,
        categories,
        sources,
        destinations,
        transactions,
        budgets,
        goals,
        recurring,
        settlements: [],
        auditLogs: [],
      };
      const historic = clearing({
        ...state,
        transactions: transactions.filter((transaction) =>
          !inMonth(transaction.transactedAt, month)
        ),
      });
      state.settlements = historic.transfers.map((transfer) => ({
        ...transfer,
        id: uid(),
        settledAt: `${month}-01T00:00:00Z`,
        notes: "Previous months settled",
      }));
      return state;
    }
    function readDemo() {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const state = JSON.parse(raw);
        if (
          state.schemaVersion !== 1 || !Array.isArray(state.transactions) ||
          !Array.isArray(state.accounts)
        ) {
          throw new Error(
            "Demo storage is incompatible. Reset the demo in settings.",
          );
        }
        return state;
      }
      const state = seedDemo();
      localStorage.setItem(STORAGE, JSON.stringify(state));
      return state;
    }
    function demoApply(state, method, endpoint, payload, key) {
      const parts = endpoint.split("/").filter(Boolean),
        [resource, entityId, action] = parts;
      const ensure = (items, id) => {
        const item = lookup(items, id);
        if (!item) throw new Error("Referenced record not found.");
        return item;
      };
      const checkBacking = (account) => {
        const reserved = sumMoney(
          state.goals.filter((goal) => goal.accountId === account.id),
          "currentAmount",
        );
        if (reserved > Math.max(0, toCents(account.currentBalance))) {
          throw new Error(
            "Release savings allocations before spending the backing funds.",
          );
        }
      };
      const move = (transaction, factor, previous = null) => {
        const changes = new Map();
        const collect = (entry, multiplier) => {
          if (["DEBIT", "TRANSFER"].includes(entry.type)) {
            changes.set(
              entry.fromAccountId,
              (changes.get(entry.fromAccountId) || 0) -
                toCents(entry.amount) * multiplier,
            );
          }
          if (["CREDIT", "TRANSFER", "ADJUSTMENT"].includes(entry.type)) {
            changes.set(
              entry.toAccountId,
              (changes.get(entry.toAccountId) || 0) +
                toCents(entry.amount) * multiplier,
            );
          }
        };
        if (previous) collect(previous, -1);
        collect(transaction, factor);
        for (const [id, delta] of changes) {
          const account = ensure(state.accounts, id);
          account.currentBalance = asDecimal(
            toCents(account.currentBalance) + delta,
          );
          checkBacking(account);
        }
      };
      const validate = (entry) => {
        if (toCents(entry.amount, false) <= 0) {
          throw new Error("Amount must be positive.");
        }
        if (ensure(state.categories, entry.categoryId).type !== entry.type) {
          throw new Error("Category must match the direction.");
        }
        ensure(state.members, entry.createdById);
        if (entry.type === "CREDIT") {
          ensure(state.sources, entry.sourceId);
          ensure(state.accounts, entry.toAccountId);
          if (entry.destinationId || entry.fromAccountId) {
            throw new Error("Credit has incompatible directional fields.");
          }
        } else if (entry.type === "DEBIT") {
          ensure(state.destinations, entry.destinationId);
          ensure(state.accounts, entry.fromAccountId);
          if (entry.sourceId || entry.toAccountId) {
            throw new Error("Debit has incompatible directional fields.");
          }
        } else if (entry.type === "TRANSFER") {
          ensure(state.accounts, entry.fromAccountId);
          ensure(state.accounts, entry.toAccountId);
          if (
            entry.fromAccountId === entry.toAccountId || entry.sourceId ||
            entry.destinationId
          ) throw new Error("Transfer requires two different accounts.");
        } else throw new Error("Unsupported transaction direction.");
        if (!Number.isFinite(Date.parse(entry.transactedAt))) {
          throw new Error("Choose a valid date.");
        }
        if (entry.allocationType === "SPLIT") {
          if (entry.type !== "DEBIT") throw new Error("Only debits can be split.");
          entry.splits = distribute(
            toCents(entry.amount),
            entry.splitStrategy,
            entry.splits,
            state.members,
          );
        } else {
          entry.splits = [];
          entry.splitStrategy = "SOLE_RESPONSIBILITY";
        }
        return entry;
      };
      const insert = (entry) => {
        const transaction = {
          ...validate(clone(entry)),
          id: uid(),
          version: 1,
          idempotencyKey: key || null,
          requestPayload: JSON.stringify(entry),
          createdAt: new Date().toISOString(),
        };
        move(transaction, 1);
        state.transactions.unshift(transaction);
        return transaction;
      };
      let result;
      if (
        resource === "transactions" && action === undefined && entityId === "import"
      ) {
        if (
          !key || !Array.isArray(payload.items) || !payload.items.length ||
          payload.items.length > 500
        ) {
          throw new Error(
            "Imports require a request key and between 1 and 500 rows.",
          );
        }
        const batchHash = JSON.stringify(payload.items),
          previousBatch = state.auditLogs.find((event) =>
            event.action === "CSV_IMPORTED" && event.detail.key === key
          );
        if (previousBatch && previousBatch.detail.hash !== batchHash) {
          throw new Error(
            "This import key belongs to a different batch. Reopen the import dialog.",
          );
        }
        result = payload.items.map((entry, index) => {
          const itemKey = `${key}_${index}`,
            existing = state.transactions.find((transaction) =>
              transaction.idempotencyKey === itemKey
            );
          if (existing) return existing;
          const transaction = insert(entry);
          transaction.idempotencyKey = itemKey;
          return transaction;
        });
        if (!previousBatch) {
          state.auditLogs.push({
            id: uid(),
            action: "CSV_IMPORTED",
            createdAt: new Date().toISOString(),
            detail: { key, hash: batchHash },
          });
        }
      } else if (resource === "transactions") {
        if (method === "POST") {
          const existing = key &&
            state.transactions.find((transaction) =>
              transaction.idempotencyKey === key
            );
          if (existing && existing.requestPayload !== JSON.stringify(payload)) {
            throw new Error(
              "This request key already belongs to a different entry. Reopen the form.",
            );
          }
          result = existing || insert(payload);
        } else {
          const old = ensure(state.transactions, entityId);
          if (old.type === "ADJUSTMENT") {
            throw new Error("Reconcile again to correct an adjustment.");
          }
          if (old.version !== payload.version) {
            throw new Error("Record changed. Refresh and retry.");
          }
          if (method === "DELETE") {
            move(old, -1);
            state.deletedTransactions = [...(state.deletedTransactions || []), {
              ...old,
              deletedAt: new Date().toISOString(),
            }];
            state.transactions = state.transactions.filter((transaction) =>
              transaction.id !== entityId
            );
            result = { ok: true };
          } else {
            result = {
              ...validate(clone(payload)),
              id: entityId,
              version: old.version + 1,
            };
            move(result, 1, old);
            state.transactions = state.transactions.map((transaction) =>
              transaction.id === entityId ? result : transaction
            );
          }
        }
      } else if (resource === "destinations" && entityId === "merge") {
        if (payload.fromId === payload.toId) {
          throw new Error("Choose two different vendors.");
        }
        ensure(state.destinations, payload.fromId);
        const target = ensure(state.destinations, payload.toId);
        state.transactions.forEach((transaction) => {
          if (transaction.destinationId === payload.fromId) {
            transaction.destinationId = payload.toId;
            transaction.version++;
          }
        });
        state.recurring.forEach((rule) => {
          if (rule.template.destinationId === payload.fromId) {
            rule.template.destinationId = payload.toId;
            rule.sourceOrPayee = target.name;
          }
        });
        state.destinations = state.destinations.filter((payee) =>
          payee.id !== payload.fromId
        );
        result = { ok: true };
      } else if (resource === "goals" && action === "contribute") {
        const goal = ensure(state.goals, entityId),
          account = ensure(state.accounts, goal.accountId);
        const next = toCents(goal.currentAmount) + toCents(payload.amount);
        if (next < 0 || next > toCents(goal.targetAmount)) {
          throw new Error("Allocation must be between zero and the target.");
        }
        goal.currentAmount = asDecimal(next);
        checkBacking(account);
        result = goal;
      } else if (resource === "budgets" && entityId === "rollover") {
        const base = new Date(payload.periodYear, payload.periodMonth - 1, 1),
          next = addMonths(base, 1),
          old = state.budgets.filter((budget) =>
            budget.periodMonth === payload.periodMonth &&
            budget.periodYear === payload.periodYear
          );
        let surplus = 0;
        for (const budget of old) {
          if (
            state.budgets.some((candidate) =>
              candidate.categoryId === budget.categoryId &&
              candidate.periodMonth === next.getMonth() + 1 &&
              candidate.periodYear === next.getFullYear()
            )
          ) continue;
          const spent = sumMoney(
            state.transactions.filter((transaction) =>
              transaction.type === "DEBIT" &&
              transaction.categoryId === budget.categoryId &&
              inMonth(transaction.transactedAt, format(base, "yyyy-MM"))
            ),
          );
          const left = Math.max(0, toCents(budget.monthlyLimit) - spent);
          if (!budget.rollover) surplus += left;
          state.budgets.push({
            ...budget,
            id: uid(),
            periodMonth: next.getMonth() + 1,
            periodYear: next.getFullYear(),
            monthlyLimit: asDecimal(
              toCents(budget.monthlyLimit) + (budget.rollover ? left : 0),
            ),
          });
        }
        if (payload.goalId) {
          const goal = ensure(state.goals, payload.goalId),
            account = ensure(state.accounts, goal.accountId),
            reserved = sumMoney(
              state.goals.filter((jar) => jar.accountId === account.id),
              "currentAmount",
            );
          goal.currentAmount = asDecimal(
            toCents(goal.currentAmount) +
              Math.min(
                surplus,
                toCents(goal.targetAmount) - toCents(goal.currentAmount),
                Math.max(0, toCents(account.currentBalance) - reserved),
              ),
          );
        }
        result = { nextMonth: next.getMonth() + 1, nextYear: next.getFullYear() };
      } else if (resource === "recurring" && action === "post") {
        const rule = ensure(state.recurring, entityId);
        if (!rule.active || rule.nextDueDate !== payload.dueDate) {
          throw new Error("Schedule changed. Refresh and retry.");
        }
        result = insert({
          ...rule.template,
          type: rule.type,
          amount: rule.amount,
          transactedAt: rule.nextDueDate,
        });
        rule.nextDueDate = advanceDate(
          rule.nextDueDate,
          rule.frequency,
          rule.anchorDay,
        );
      } else if (resource === "recurring" && action === "review") {
        const rule = ensure(state.recurring, entityId);
        rule.lastReviewedAt = new Date().toISOString();
        result = rule;
      } else if (resource === "settlements") {
        const net = clearing(state).balances,
          amount = toCents(payload.amount, false);
        if (
          amount <= 0 || payload.fromMemberId === payload.toMemberId ||
          !(net[payload.fromMemberId] < 0 && net[payload.toMemberId] > 0) ||
          amount > Math.min(-net[payload.fromMemberId], net[payload.toMemberId])
        ) throw new Error("Settlement exceeds outstanding balances.");
        result = { ...payload, id: uid(), settledAt: new Date().toISOString() };
        state.settlements.push(result);
      } else if (resource === "accounts" && action === "reconcile") {
        const account = ensure(state.accounts, entityId);
        if (toCents(account.currentBalance) !== toCents(payload.expectedBalance)) {
          throw new Error("Account balance changed. Review again.");
        }
        const difference = toCents(payload.statementBalance) -
          toCents(account.currentBalance);
        if (difference) {
          const transaction = {
            id: uid(),
            type: "ADJUSTMENT",
            amount: asDecimal(difference),
            toAccountId: account.id,
            fromAccountId: null,
            categoryId: state.categories.find((category) =>
              category.type === "ADJUSTMENT"
            ).id,
            createdById: state.currentMemberId,
            transactedAt: new Date().toISOString(),
            allocationType: "SHARED",
            splitStrategy: "SOLE_RESPONSIBILITY",
            splits: [],
            notes: payload.notes,
            version: 1,
          };
          move(transaction, 1);
          state.transactions.unshift(transaction);
        }
        account.lastReconciledAt = new Date().toISOString();
        result = account;
      } else if (resource === "members") {
        if (method === "PATCH") {
          const member = ensure(state.members, entityId);
          if (
            member.role === "ADMIN" && payload.role !== "ADMIN" &&
            state.members.filter((member) => member.role === "ADMIN").length <= 1
          ) throw new Error("Keep at least one administrator.");
          member.role = payload.role;
          result = member;
        } else {
          if (state.members.some((member) => member.user.email === payload.email)) {
            throw new Error("This member already belongs to the household.");
          }
          const firstName = payload.email.split("@")[0];
          result = {
            id: uid(),
            role: payload.role,
            user: { firstName, lastName: "", email: payload.email },
          };
          state.members.push(result);
        }
      } else {
        if (
          ![
            "accounts",
            "sources",
            "destinations",
            "categories",
            "budgets",
            "goals",
            "recurring",
          ].includes(resource)
        ) throw new Error("Unknown demo operation.");
        const items = state[resource];
        if (method === "DELETE") {
          const item = ensure(items, entityId);
          if (resource === "goals" && toCents(item.currentAmount)) {
            throw new Error("Release the goal allocation first.");
          }
          if (
            state.transactions.some((transaction) =>
              [
                transaction.categoryId,
                transaction.sourceId,
                transaction.destinationId,
                transaction.fromAccountId,
                transaction.toAccountId,
              ].includes(entityId)
            ) || state.recurring.some((rule) =>
              Object.values(rule.template).includes(entityId)
            ) || state.goals.some((goal) =>
              goal.accountId === entityId
            )
          ) throw new Error("This record is referenced by another record.");
          if (resource === "categories") {
            state.budgets = state.budgets.filter((budget) =>
              budget.categoryId !== entityId
            );
            state.destinations.forEach((payee) => {
              if (payee.defaultCategoryId === entityId) {
                payee.defaultCategoryId = null;
              }
            });
          }
          state[resource] = items.filter((item) => item.id !== entityId);
          result = { ok: true };
        } else {
          const existing = method === "PATCH" ? ensure(items, entityId) : null;
          if (
            resource !== "budgets" &&
            (typeof payload.name !== "string" || !payload.name.trim() ||
              payload.name.trim().length > 120) &&
            resource !== "recurring"
          ) throw new Error("Enter a name between 1 and 120 characters.");
          if (payload.name) payload.name = payload.name.trim();
          result = { ...existing, ...clone(payload), id: existing?.id || uid() };
          if (resource === "accounts") {
            result.currentBalance = payload.openingBalance;
            toCents(payload.openingBalance);
          }
          if (
            resource === "categories" && existing &&
            existing.type !== payload.type &&
            (state.transactions.some((transaction) =>
              transaction.categoryId === existing.id
            ) || state.budgets.some((budget) =>
              budget.categoryId === existing.id
            ) || state.destinations.some((payee) =>
              payee.defaultCategoryId === existing.id
            ) || state.recurring.some((rule) =>
              rule.template.categoryId === existing.id
            ))
          ) {
            throw new Error(
              "A referenced category cannot change accounting direction.",
            );
          }
          if (resource === "goals") {
            ensure(state.accounts, payload.accountId);
            result.currentAmount = existing?.currentAmount || "0.00";
            if (
              toCents(result.targetAmount) <= 0 ||
              toCents(result.targetAmount) < toCents(result.currentAmount)
            ) {
              throw new Error(
                "Goal target must be positive and exceed its allocation.",
              );
            }
            if (
              existing && existing.accountId !== payload.accountId &&
              toCents(existing.currentAmount)
            ) {
              throw new Error("Release allocations before changing accounts.");
            }
          }
          if (resource === "budgets") {
            if (
              ensure(state.categories, payload.categoryId).type !== "DEBIT" ||
              toCents(payload.monthlyLimit) <= 0
            ) {
              throw new Error("Choose a debit category and positive limit.");
            }
            if (
              items.some((item) =>
                item.id !== existing?.id &&
                item.categoryId === payload.categoryId &&
                item.periodMonth === payload.periodMonth &&
                item.periodYear === payload.periodYear
              )
            ) {
              throw new Error("This category already has a budget for that month.");
            }
          }
          if (resource === "recurring") {
            validate(clone(payload.template));
            result.anchorDay = Number(String(payload.nextDueDate).slice(8, 10));
            result.lastReviewedAt = new Date().toISOString();
          }
          if (existing) {
            state[resource] = items.map((item) =>
              item.id === entityId ? result : item
            );
          } else items.push(result);
        }
      }
      state.auditLogs.push({
        id: uid(),
        action: `${method} ${endpoint}`,
        actorId: state.currentMemberId,
        createdAt: new Date().toISOString(),
        detail: { entityId: result?.id || entityId || resource },
      });
      return result;
    }
    const connection = { csrf: "", householdId: "" };
    async function api(endpoint, options = {}) {
      const response = await fetch(`/api${endpoint}`, {
        credentials: "same-origin",
        ...options,
        headers: {
          "Content-Type": "application/json",
          "X-Household-Id": connection.householdId,
          "X-CSRF-Token": connection.csrf,
          ...(options.headers || {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      const body = await response.json().catch(() => ({
        error: "The API did not return JSON. Run the backend and open its URL.",
      }));
      if (!response.ok) {
        const error = new Error(body.error || "Request failed.");
        error.status = response.status;
        throw error;
      }
      return body;
    }
    function exportCSV(transactions, state, filename = "household-ledger.csv") {
      const headers = [
        "date",
        "type",
        "amount",
        "category",
        "entity",
        "fromAccount",
        "toAccount",
        "member",
        "allocation",
        "notes",
      ];
      const escape = (value) => {
        const text = String(value ?? "");
        return `"${
          (/^[=+\-@\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')
        }"`;
      };
      const rows = transactions.map(
        (transaction) => [
          String(transaction.transactedAt).slice(0, 10),
          transaction.type,
          transaction.amount,
          lookup(state.categories, transaction.categoryId)?.name,
          lookup(
            transaction.type === "CREDIT" ? state.sources : state.destinations,
            transaction.sourceId || transaction.destinationId,
          )?.name || "",
          lookup(state.accounts, transaction.fromAccountId)?.name || "",
          lookup(state.accounts, transaction.toAccountId)?.name || "",
          fullName(lookup(state.members, transaction.createdById)),
          transaction.allocationType,
          transaction.notes || "",
        ],
      );
      downloadFile(
        "\uFEFF" +
          [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n"),
        "text/csv;charset=utf-8",
        filename,
      );
    }
    function downloadFile(content, type, filename) {
      const url = URL.createObjectURL(new Blob([content], { type }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function parseCSV(text) {
      const rows = [], row = [];
      let value = "", quoted = false;
      text = text.replace(/^\uFEFF/, "");
      for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (char === '"') {
          if (quoted && text[index + 1] === '"') {
            value += '"';
            index++;
          } else quoted = !quoted;
        } else if (char === "," && !quoted) {
          row.push(value);
          value = "";
        } else if ((char === "\n" || char === "\r") && !quoted) {
          if (char === "\r" && text[index + 1] === "\n") index++;
          row.push(value);
          if (row.some(Boolean)) rows.push([...row]);
          row.length = 0;
          value = "";
        } else value += char;
      }
      if (quoted) throw new Error("CSV contains an unclosed quoted field.");
      if (value || row.length) {
        row.push(value);
        rows.push([...row]);
      }
      return rows;
    }
    function importRows(text, state) {
      const [headers, ...rows] = parseCSV(text);
      if (
        !headers ||
        ![
          "date",
          "type",
          "amount",
          "category",
          "entity",
          "fromAccount",
          "toAccount",
          "member",
          "allocation",
          "notes",
        ].every((field) => headers.includes(field))
      ) throw new Error("Use the exported CSV header format.");
      if (!rows.length || rows.length > 500) {
        throw new Error("Import between 1 and 500 rows at a time.");
      }
      const resolve = (items, name, label) => {
        const found = items.filter((item) => item.name === name);
        if (found.length !== 1) {
          throw new Error(
            `${label} “${name}” must match exactly one existing record.`,
          );
        }
        return found[0].id;
      };
      return rows.map((row, index) => {
        try {
          const data = Object.fromEntries(
            headers.map((header, column) => [header, row[column] || ""]),
          );
          if (!["CREDIT", "DEBIT", "TRANSFER"].includes(data.type)) {
            throw new Error("Only credits, debits, and transfers can be imported.");
          }
          if (data.allocation === "SPLIT") {
            throw new Error(
              "Import split entries as SHARED, then assign splits manually.",
            );
          }
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
            !Number.isFinite(Date.parse(data.date)) ||
            new Date(data.date).toISOString().slice(0, 10) !== data.date
          ) throw new Error("Invalid calendar date.");
          if (toCents(data.amount, false) <= 0) {
            throw new Error("Amount must be positive.");
          }
          const matches = state.members.filter((member) =>
            fullName(member) === data.member
          );
          if (matches.length !== 1) {
            throw new Error("Member name must match exactly one existing member.");
          }
          return {
            type: data.type,
            amount: data.amount,
            transactedAt: data.date + "T12:00:00Z",
            categoryId: resolve(
              state.categories.filter((category) => category.type === data.type),
              data.category,
              "Category",
            ),
            sourceId: data.type === "CREDIT"
              ? resolve(state.sources, data.entity, "Source")
              : null,
            destinationId: data.type === "DEBIT"
              ? resolve(state.destinations, data.entity, "Vendor")
              : null,
            fromAccountId: data.type !== "CREDIT"
              ? resolve(state.accounts, data.fromAccount, "Payment account")
              : null,
            toAccountId: data.type !== "DEBIT"
              ? resolve(state.accounts, data.toAccount, "Deposit account")
              : null,
            createdById: matches[0].id,
            allocationType: data.allocation === "INDIVIDUAL"
              ? "INDIVIDUAL"
              : "SHARED",
            splitStrategy: "SOLE_RESPONSIBILITY",
            splits: [],
            notes: data.notes,
          };
        } catch (error) {
          throw new Error(`CSV row ${index + 2}: ${error.message}`);
        }
      });
    }
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 30000 },
        mutations: { retry: false },
      },
    });
    const ThemeContext = React.createContext("light");
    function Icon({ icon: Component, size = 16, ...props }) {
      return (
        <Component size={size} strokeWidth={1.7} aria-hidden="true" {...props} />
      );
    }
    function Button({ icon, children, variant = "", ...props }) {
      return (
        <button type="button" className={`btn ${variant}`} {...props}>
          {icon && <Icon icon={icon} size={14} />}
          {children}
        </button>
      );
    }
    function Avatar({ member }) {
      return (
        <span className="avatar" title={fullName(member)}>{initials(member)}</span>
      );
    }
    function Progress({ value, color }) {
      return (
        <div
          className="progress"
          role="progressbar"
          aria-valuenow={Math.round(value)}
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span
            style={{
              width: `${Math.max(0, Math.min(100, value))}%`,
              background: color || (value > 90
                ? "var(--debit)"
                : value > 70
                ? "var(--amber)"
                : "var(--credit)"),
            }}
          />
        </div>
      );
    }
    function Empty(
      {
        title = "A fresh start",
        message = "Add your first record to get started.",
        action,
      },
    ) {
      return (
        <div className="empty-state">
          <Icon icon={FolderPlus} size={30} />
          <h3>{title}</h3>
          <p>{message}</p>
          {action}
        </div>
      );
    }
    function Chart(
      { type = "bar", data, options = {}, onClick, height = "", center },
    ) {
      const canvas = useRef(null),
        latestClick = useRef(onClick),
        theme = React.useContext(ThemeContext);
      latestClick.current = onClick;
      const signature = JSON.stringify({ type, data, options, theme });
      useEffect(() => {
        if (!window.Chart || !canvas.current) return;
        const dark = theme === "dark";
        const chart = new window.Chart(canvas.current, {
          type,
          data,
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 450 },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: "#1a3434",
                padding: 12,
                titleFont: { family: "Inter" },
                bodyFont: { family: "JetBrains Mono", size: 11 },
              },
            },
            ...(type === "doughnut" ? { cutout: "77%", borderWidth: 0 } : {
              scales: {
                x: {
                  grid: { display: false },
                  border: { display: false },
                  ticks: {
                    color: dark ? "#94a6b1" : "#8996a2",
                    font: { size: 10 },
                    maxRotation: 0,
                  },
                },
                y: {
                  grid: { color: dark ? "#2c3e48" : "#eef1f4" },
                  border: { display: false },
                  ticks: {
                    color: dark ? "#94a6b1" : "#8996a2",
                    font: { size: 9 },
                    callback: (value) => value >= 1000 ? `${value / 1000}k` : value,
                  },
                },
              },
            }),
            ...options,
            onClick: (event, elements) => {
              if (elements[0]) latestClick.current?.(elements[0].index);
            },
          },
        });
        return () => chart.destroy();
      }, [signature]);
      return (
        <div className={`chart-wrap ${height}`}>
          <canvas
            ref={canvas}
            role="img"
            aria-label={`${type} chart: ${data.labels?.join(", ")}`}
          />
          {center && (
            <div className="donut-total">
              <strong className="money">{center.value}</strong>
              <small>{center.label}</small>
            </div>
          )}
          {!window.Chart && (
            <p className="muted">
              Chart library unavailable. Check your connection.
            </p>
          )}
        </div>
      );
    }
    function Modal({ title, children, onClose, wide = false }) {
      const container = useRef(null),
        previousFocus = useRef(document.activeElement),
        closeRef = useRef(onClose);
      closeRef.current = onClose;
      useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const focusable = () =>
          [...container.current.querySelectorAll(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          )].filter((element) => element.offsetParent !== null);
        focusable()[0]?.focus();
        const handler = (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeRef.current();
          }
          if (event.key === "Tab") {
            const items = focusable(),
              first = items[0],
              last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        };
        document.addEventListener("keydown", handler);
        return () => {
          document.body.style.overflow = previousOverflow;
          document.removeEventListener("keydown", handler);
          previousFocus.current?.focus();
        };
      }, []);
      return (
        <div
          className="overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <section
            ref={container}
            className={`modal ${wide ? "wide" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-header">
              <h2 id="modal-title">{title}</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={onClose}
                aria-label="Close dialog"
              >
                <Icon icon={X} size={20} />
              </button>
            </div>
            {children}
          </section>
        </div>
      );
    }
    function Field({ label, children, full, help, error }) {
      return (
        <label className={`field ${full ? "full" : ""}`}>
          <span>{label}</span>
          {children}
          {help && <span className="help">{help}</span>}
          {error && <span className="error">{error}</span>}
        </label>
      );
    }
    function SelectOptions({ items, label = "name", placeholder = "Select…" }) {
      return (
        <>
          <option value="">{placeholder}</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {typeof label === "function" ? label(item) : item[label]}
            </option>
          ))}
        </>
      );
    }

    function App() {
      const [mode, setMode] = useState(() =>
        localStorage.getItem("household.mode") || "demo"
      );
      const [session, setSession] = useState(null),
        [authOpen, setAuthOpen] = useState(false),
        [booting, setBooting] = useState(mode === "server");
      const [householdId, setHouseholdId] = useState("");
      const [page, setPage] = useState(() =>
        PAGES.some((item) => item[0] === location.hash.slice(2))
          ? location.hash.slice(2)
          : "dashboard"
      );
      const [month, setMonth] = useState(monthISO()),
        [theme, setTheme] = useState(() =>
          localStorage.getItem("household.theme") || "light"
        );
      const [collapsed, setCollapsed] = useState(false),
        [mobileOpen, setMobileOpen] = useState(false),
        [modal, setModal] = useState(null),
        [toasts, setToasts] = useState([]),
        [globalSearch, setGlobalSearch] = useState("");
      const searchRef = useRef(null),
        toastTimers = useRef([]),
        client = useQueryClient();
      connection.householdId = householdId;
      connection.csrf = session?.csrfToken || "";
      const notify = useCallback((message, error = false) => {
        const id = uid();
        setToasts((items) => [...items.slice(-3), { id, message, error }]);
        toastTimers.current.push(
          setTimeout(
            () => setToasts((items) => items.filter((item) => item.id !== id)),
            error ? 9000 : 4500,
          ),
        );
      }, []);
      const navigate = useCallback((next) => {
        location.hash = `/${next}`;
        setPage(next);
        setMobileOpen(false);
      }, []);
      useEffect(() => {
        const handler = () => {
          const requested = location.hash.slice(2);
          setPage(
            PAGES.some((item) => item[0] === requested) ? requested : "dashboard",
          );
        };
        window.addEventListener("hashchange", handler);
        return () => window.removeEventListener("hashchange", handler);
      }, []);
      useEffect(() => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem("household.theme", theme);
      }, [theme]);
      useEffect(() => () => toastTimers.current.forEach(clearTimeout), []);
      useEffect(() => {
        if (mode !== "server") return;
        let active = true;
        api("/auth/session").then((result) => {
          if (!active) return;
          setSession(result);
          setHouseholdId(result.memberships[0]?.householdId || "");
        }).catch(() => {
          if (active) {
            setAuthOpen(true);
            setSession(null);
          }
        }).finally(() => {
          if (active) setBooting(false);
        });
        return () => {
          active = false;
        };
      }, [mode]);
      const queryKey = ["household", mode, householdId];
      const query = useQuery({
        queryKey,
        queryFn: () => mode === "demo" ? readDemo() : api("/state"),
        enabled: mode === "demo" || !!session && !!householdId,
        refetchInterval: mode === "server" ? 60000 : false,
      });
      const state = query.data;
      useEffect(() => {
        if (mode === "server" && query.error?.status === 401) {
          setSession(null);
          setAuthOpen(true);
        }
      }, [mode, query.error]);
      const current = state?.members.find((member) =>
        member.id === state.currentMemberId
      );
      const canWrite = current?.role !== "VIEWER",
        isAdmin = current?.role === "ADMIN";
      const mutation = useMutation({
        mutationFn: async ({ method = "POST", endpoint, payload, key }) => {
          if (mode === "server") {
            return api(endpoint, {
              method,
              body: payload,
              headers: key ? { "Idempotency-Key": key } : {},
            });
          }
          const draft = clone(readDemo()),
            result = demoApply(draft, method, endpoint, payload || {}, key);
          localStorage.setItem(STORAGE, JSON.stringify(draft));
          client.setQueryData(queryKey, draft);
          return result;
        },
        onSuccess: () => client.invalidateQueries({ queryKey }),
        onError: (error) => {
          notify(error.message, true);
          if (error.status === 401) {
            setSession(null);
            setAuthOpen(true);
          }
        },
      });
      const mutate = async (
        method,
        endpoint,
        payload,
        message = "Changes saved.",
        key,
      ) => {
        const result = await mutation.mutateAsync({
          method,
          endpoint,
          payload,
          key,
        });
        if (message) notify(message);
        return result;
      };
      const money = (value, compact = false) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: state?.household.currency || "USD",
          minimumFractionDigits: compact ? 0 : 2,
          maximumFractionDigits: compact ? 0 : 2,
        }).format(Number(value) / 100);
      const monthly =
        state?.transactions.filter((transaction) =>
          inMonth(transaction.transactedAt, month)
        ) || [];
      const previousMonth = format(
        addMonths(new Date(month + "-01T12:00:00"), -1),
        "yyyy-MM",
      );
      const previous =
        state?.transactions.filter((transaction) =>
          inMonth(transaction.transactedAt, previousMonth)
        ) || [];
      const credits = sumMoney(
          monthly.filter((transaction) => transaction.type === "CREDIT"),
        ),
        debits = sumMoney(
          monthly.filter((transaction) => transaction.type === "DEBIT"),
        );
      const priorCredits = sumMoney(
          previous.filter((transaction) => transaction.type === "CREDIT"),
        ),
        priorDebits = sumMoney(
          previous.filter((transaction) => transaction.type === "DEBIT"),
        );
      const balance = state ? sumMoney(state.accounts, "currentBalance") : 0;
      const openTransaction = (type = "DEBIT", entry = null) =>
        setModal({ kind: "transaction", type, entry });
      useEffect(() => {
        const handler = (event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "k") {
            event.preventDefault();
            searchRef.current?.focus();
          }
          if (
            !modal && !authOpen && canWrite && event.key.toLowerCase() === "n" &&
            !["INPUT", "TEXTAREA", "SELECT"].includes(
              document.activeElement?.tagName,
            )
          ) {
            event.preventDefault();
            openTransaction();
          }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
      }, [modal, authOpen, canWrite]);
      const entityName = (transaction) =>
        lookup(
          transaction.type === "CREDIT" ? state.sources : state.destinations,
          transaction.sourceId || transaction.destinationId,
        )?.name || (transaction.type === "TRANSFER"
          ? "Internal transfer"
          : "Statement adjustment");
      const categoryStats = state
        ? state.categories.filter((category) => category.type === "DEBIT").map(
          (category) => ({
            ...category,
            total: sumMoney(
              monthly.filter((transaction) =>
                transaction.type === "DEBIT" &&
                transaction.categoryId === category.id
              ),
            ),
          }),
        ).filter((category) => category.total > 0).sort((left, right) =>
          right.total - left.total
        )
        : [];
      const budgets =
        state?.budgets.filter((budget) =>
          budget.periodYear === Number(month.slice(0, 4)) &&
          budget.periodMonth === Number(month.slice(5))
        ) || [];
      const categorySpent = (id) =>
        sumMoney(
          monthly.filter((transaction) =>
            transaction.type === "DEBIT" && transaction.categoryId === id
          ),
        );
      const overBudgets = budgets.filter((budget) =>
        categorySpent(budget.categoryId) > toCents(budget.monthlyLimit)
      );
      const props = {
        state,
        monthly,
        month,
        setMonth,
        money,
        mutate,
        mutation,
        notify,
        setModal,
        openTransaction,
        canWrite,
        isAdmin,
        entityName,
        categoryStats,
        budgets,
        categorySpent,
        mode,
        globalSearch,
        navigate,
      };
      const logout = async () => {
        if (mode === "server") {
          try {
            await api("/auth/logout", { method: "POST", body: {} });
          } catch (error) {
            if (error.status !== 401) {
              notify(error.message, true);
              return;
            }
          }
        }
        setSession(null);
        setAuthOpen(true);
        client.clear();
      };
      const useDemo = () => {
        setMode("demo");
        localStorage.setItem("household.mode", "demo");
        setAuthOpen(false);
        setSession(null);
        setHouseholdId("");
        setBooting(false);
        client.clear();
      };
      const authenticated = (result) => {
        setSession(result);
        setHouseholdId(result.memberships[0]?.householdId || "");
        setMode("server");
        localStorage.setItem("household.mode", "server");
        setAuthOpen(false);
        setBooting(false);
        client.clear();
      };
      const connect = () => {
        setAuthOpen(true);
      };
      if (booting) {
        return <div className="loading">Restoring your secure session…</div>;
      }
      if (mode === "server" && !session) {
        return (
          <AuthScreen onSuccess={authenticated} onDemo={useDemo} notify={notify} />
        );
      }
      return (
        <ThemeContext.Provider value={theme}>
          <div
            className={`${collapsed ? "collapsed" : ""} ${
              mobileOpen ? "mobile-open" : ""
            }`}
          >
            <aside className="sidebar" aria-label="Primary navigation">
              <a className="brand" href="#/dashboard">
                <span className="brand-mark">
                  <Icon icon={House} size={23} />
                </span>
                <span className="brand-text">
                  household<span style={{ color: "#92c9a8" }}>.</span>
                </span>
              </a>
              <div className="house-selector">
                <Icon icon={Users} size={17} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <small style={{ fontSize: 9, color: "#739593" }}>
                    YOUR WORKSPACE
                  </small>
                  {mode === "server"
                    ? (
                      <select
                        aria-label="Select household"
                        value={householdId}
                        onChange={(event) => {
                          setHouseholdId(event.target.value);
                          setModal(null);
                        }}
                      >
                        {session.memberships.map((member) => (
                          <option value={member.householdId} key={member.id}>
                            {member.household.name}
                          </option>
                        ))}
                      </select>
                    )
                    : (
                      <div style={{ color: "#e0ece8", fontSize: 12 }}>
                        Morgan household
                      </div>
                    )}
                </div>
                <Icon icon={ChevronDown} size={13} />
              </div>
              <div className="eyebrow">Workspace</div>
              <nav className="nav">
                {PAGES.map(([id, title, icon], index) => (
                  <a
                    href={`#/${id}`}
                    onClick={() => navigate(id)}
                    key={id}
                    className={page === id ? "active" : ""}
                    aria-current={page === id ? "page" : undefined}
                    title={title}
                  >
                    <Icon icon={icon} size={17} />
                    <span className="nav-label">{title}</span>
                    {id === "recurring" && (
                      <span className="nav-badge">
                        {state?.recurring.filter((rule) => rule.active).length || 0}
                      </span>
                    )}
                    {index === 4 && (
                      <span className="nav-badge">{overBudgets.length || ""}</span>
                    )}
                  </a>
                ))}
              </nav>
              <div className="sidebar-bottom">
                <div className="sidebar-balance">
                  <small style={{ fontSize: 10 }}>TOTAL HOUSEHOLD BALANCE</small>
                  <strong className="money">{money(balance)}</strong>
                  <span
                    className="flex gap6"
                    style={{ fontSize: 9, color: "#8bc9a6" }}
                  >
                    <Icon icon={ShieldCheck} size={12} />
                    {mode === "demo"
                      ? "Local demo workspace"
                      : "Household-scoped & secure"}
                  </span>
                </div>
                <div className="sidebar-footer">
                  <Avatar member={current} />
                  <div className="user-info" style={{ flex: 1 }}>
                    <strong>{fullName(current)}</strong>
                    <div style={{ fontSize: 9, color: "#729390" }}>
                      {current?.role === "ADMIN"
                        ? "Household administrator"
                        : current?.role || "Loading…"}
                    </div>
                  </div>
                  <button
                    className="icon-btn"
                    aria-label="Open workspace settings"
                    onClick={() => setModal({ kind: "settings" })}
                  >
                    <Icon icon={Settings} size={17} />
                  </button>
                </div>
              </div>
            </aside>
            <div className="content">
              <header className="topbar">
                <button
                  className="icon-btn mobile-menu"
                  onClick={() => setMobileOpen(!mobileOpen)}
                  aria-label="Toggle navigation"
                >
                  <Icon icon={Menu} size={21} />
                </button>
                <div className="breadcrumb">
                  <button
                    className="icon-btn"
                    onClick={() => setCollapsed(!collapsed)}
                    aria-label="Collapse sidebar"
                  >
                    <Icon icon={PanelLeftClose} size={16} />
                  </button>
                  <span>Workspace</span>
                  <Icon icon={ChevronRight} size={12} />
                  <b>{PAGES.find((item) => item[0] === page)?.[1]}</b>
                </div>
                <div className="topbar-right">
                  <form
                    className="global-search"
                    onSubmit={(event) => {
                      event.preventDefault();
                      navigate("transactions");
                    }}
                  >
                    <Icon icon={Search} size={15} />
                    <input
                      ref={searchRef}
                      placeholder="Search transactions…"
                      value={globalSearch}
                      onChange={(event) => setGlobalSearch(event.target.value)}
                      aria-label="Global transaction search"
                    />
                    <span className="kbd">⌘K</span>
                  </form>
                  <div className="vertical-line" />
                  <button
                    className="icon-btn"
                    onClick={() => setModal({ kind: "alerts" })}
                    aria-label="View notifications"
                    style={{ position: "relative" }}
                  >
                    <Icon icon={Bell} size={18} />
                    {overBudgets.length > 0 && (
                      <span
                        className="dot red"
                        style={{ position: "absolute", right: 4, top: 4 }}
                      />
                    )}
                  </button>
                  <Button
                    icon={Plus}
                    variant="primary"
                    onClick={() => openTransaction()}
                    disabled={!canWrite}
                  >
                    Add transaction
                  </Button>
                  <button
                    className="icon-btn"
                    onClick={() => setModal({ kind: "settings" })}
                    aria-label="Profile"
                  >
                    <Avatar member={current} />
                  </button>
                </div>
              </header>
              <main className="main">
                <div className="page-heading">
                  <div>
                    <h1>
                      {page === "dashboard"
                        ? "Overview"
                        : PAGES.find((item) => item[0] === page)?.[1]}
                    </h1>
                    <p className="subtitle">
                      {PAGES.find((item) => item[0] === page)?.[3]}
                    </p>
                  </div>
                  <div className="page-actions">
                    <Button
                      icon={Download}
                      onClick={() =>
                        state &&
                        exportCSV(monthly, state, `household-${month}.csv`)}
                      disabled={!state}
                    >
                      Export
                    </Button>
                    <input
                      type="month"
                      aria-label="Reporting month"
                      value={month}
                      min="2000-01"
                      max="2200-12"
                      onChange={(event) => {
                        if (event.target.value) setMonth(event.target.value);
                      }}
                    />
                  </div>
                </div>
                {mode === "demo" && (
                  <div className="welcome">
                    <p>
                      Good {new Date().getHours() < 12
                        ? "morning"
                        : new Date().getHours() < 18
                        ? "afternoon"
                        : "evening"}, Alex <span style={{ marginLeft: 5 }}>✦</span>
                      {" "}
                      <span style={{ marginLeft: 6 }}>
                        Let’s make your money work for you.
                      </span>
                    </p>
                    <div className="flex">
                      <span className="demo-tag">DEMO DATA</span>
                      <button className="btn ghost small-button" onClick={connect}>
                        Connect to server <Icon icon={ArrowUpRight} size={12} />
                      </button>
                    </div>
                  </div>
                )}
                {query.isError
                  ? (
                    <div className="notice error">
                      <span>{query.error.message}</span>
                      <Button icon={RefreshCw} onClick={() => query.refetch()}>
                        Retry
                      </Button>
                      {mode === "demo" && (
                        <Button
                          onClick={() => {
                            localStorage.removeItem(STORAGE);
                            query.refetch();
                          }}
                        >
                          Reset demo
                        </Button>
                      )}
                    </div>
                  )
                  : !state
                  ? <div className="loading">Loading household records…</div>
                  : (
                    <>
                      {current?.role === "VIEWER" && (
                        <div
                          className="notice warning"
                          style={{ marginBottom: 20 }}
                        >
                          You have viewer access. Your household ledger is
                          read-only.
                        </div>
                      )}
                      {page === "dashboard" && (
                        <Overview
                          {...props}
                          credits={credits}
                          debits={debits}
                          priorCredits={priorCredits}
                          priorDebits={priorDebits}
                          balance={balance}
                          overBudgets={overBudgets}
                        />
                      )}
                      {page === "transactions" && <Ledger {...props} />}
                      {page === "credits" && <IncomeHub {...props} />}
                      {page === "debits" && <ExpenseHub {...props} />}
                      {page === "budgets" && (
                        <Budgets {...props} credits={credits} />
                      )}
                      {page === "recurring" && <Recurring {...props} />}
                      {page === "family-splits" && <Family {...props} />}
                      {page === "savings-goals" && <Goals {...props} />}
                      {page === "analytics" && (
                        <>
                          <Analytics {...props} balance={balance} />
                          <CategoryComparison {...props} />
                        </>
                      )}
                      {page === "accounts" && (
                        <Accounts {...props} balance={balance} />
                      )}
                    </>
                  )}
                <footer className="page-footer">
                  <span>
                    household. <span style={{ margin: "0 7px" }}>·</span>{" "}
                    A little clarity. A lot of possibility.
                  </span>
                  <span className="status">
                    <span className="dot green" />
                    {mode === "demo"
                      ? "Saved in this browser · not synced to a server"
                      : query.isFetching
                      ? "Syncing…"
                      : `API connected · ${state?.household.currency || ""}`}
                    <button
                      className="icon-btn"
                      aria-label="Toggle color theme"
                      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                    >
                      <Icon icon={theme === "light" ? Moon : Sun} size={13} />
                    </button>
                  </span>
                </footer>
              </main>
            </div>
            {modal && state && (
              <AppModal
                {...props}
                modal={modal}
                onClose={() => setModal(null)}
                theme={theme}
                setTheme={setTheme}
                logout={logout}
                connect={connect}
                query={query}
              />
            )}
            {authOpen && mode === "demo" && (
              <Modal
                title="Connect your household"
                onClose={() => setAuthOpen(false)}
              >
                <AuthForm
                  onSuccess={authenticated}
                  onDemo={() => setAuthOpen(false)}
                  notify={notify}
                />
              </Modal>
            )}
            <div className="toast-stack" role="status" aria-live="polite">
              {toasts.map((toast) => (
                <div
                  className={`toast ${toast.error ? "error" : ""}`}
                  key={toast.id}
                >
                  <Icon icon={toast.error ? CircleAlert : CircleCheck} size={17} />
                  <span>{toast.message}</span>
                  <button
                    className="icon-btn"
                    aria-label="Dismiss notification"
                    onClick={() =>
                      setToasts((items) =>
                        items.filter((item) => item.id !== toast.id)
                      )}
                  >
                    <Icon icon={X} size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </ThemeContext.Provider>
      );
    }

    function KPI({ label, value, icon, footer, featured = false, color, badge }) {
      return (
        <div className={`card kpi ${featured ? "featured" : ""}`}>
          <div className="between">
            <span className="label">{label}</span>
            <span
              className="icon-tile"
              style={color ? { color, background: `${color}13` } : {}}
            >
              <Icon icon={icon} size={15} />
            </span>
          </div>
          <div className="value money">{value}</div>
          <div className="foot">
            {badge && (
              <span className="green flex gap6">
                <Icon icon={ArrowUpRight} size={12} />
                {badge}
              </span>
            )}
            {footer}
          </div>
        </div>
      );
    }
    function CashChart({ monthly, month }) {
      const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0)
        .getDate();
      const labels = [], incoming = [], outgoing = [];
      for (let day = 1; day <= days; day += 3) {
        labels.push(String(day).padStart(2, "0"));
        const group = monthly.filter((transaction) =>
          Number(String(transaction.transactedAt).slice(8, 10)) >= day &&
          Number(String(transaction.transactedAt).slice(8, 10)) < day + 3
        );
        incoming.push(
          sumMoney(group.filter((transaction) => transaction.type === "CREDIT")) /
            100,
        );
        outgoing.push(
          sumMoney(group.filter((transaction) => transaction.type === "DEBIT")) /
            100,
        );
      }
      return (
        <Chart
          type="bar"
          data={{
            labels,
            datasets: [{
              label: "Income",
              data: incoming,
              backgroundColor: "#68b69c",
              borderRadius: 4,
              barPercentage: .62,
              categoryPercentage: .65,
            }, {
              label: "Expenses",
              data: outgoing,
              backgroundColor: "#e9c0a5",
              borderRadius: 4,
              barPercentage: .62,
              categoryPercentage: .65,
            }],
          }}
        />
      );
    }
    function Overview(props) {
      const {
        state,
        monthly,
        month,
        money,
        credits,
        debits,
        priorCredits,
        priorDebits,
        balance,
        overBudgets,
        categoryStats,
        categorySpent,
        budgets,
        navigate,
        openTransaction,
        canWrite,
        entityName,
      } = props;
      const net = credits - debits, priorNet = priorCredits - priorDebits;
      const delta = priorNet
        ? `${((net - priorNet) / Math.abs(priorNet) * 100).toFixed(1)}%`
        : null;
      const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0)
          .getDate(),
        elapsed = month === monthISO() ? new Date().getDate() : days;
      const burn = debits / Math.max(1, elapsed),
        forecast = balance - burn * Math.max(0, days - elapsed);
      const top = categoryStats.slice(0, 5);
      let topTotal = top.reduce((sum, category) => sum + category.total, 0);
      if (topTotal < debits) {
        top.push({
          id: "other",
          name: "Other categories",
          total: debits - topTotal,
          colorCode: "#b7c2cc",
        });
        topTotal = debits;
      }
      return (
        <>
          <div className="kpi-grid">
            <KPI
              label="Net cash flow"
              value={money(net)}
              icon={ChartNoAxesCombined}
              featured
              badge={delta}
              footer={priorNet ? "vs. previous month" : "Income less expenses"}
            />
            <KPI
              label="Total income"
              value={money(credits)}
              icon={ArrowDownLeft}
              color="#169979"
              badge={priorCredits
                ? `${((credits - priorCredits) / priorCredits * 100).toFixed(1)}%`
                : null}
              footer={`${
                monthly.filter((transaction) => transaction.type === "CREDIT")
                  .length
              } credits this month`}
            />
            <KPI
              label="Total expenses"
              value={money(debits)}
              icon={ArrowUpRight}
              color="#e16a72"
              footer={`${
                monthly.filter((transaction) => transaction.type === "DEBIT").length
              } debits this month`}
            />
            <KPI
              label="Projected month-end reserve"
              value={money(forecast)}
              icon={PiggyBank}
              color="#7186d5"
              footer={`${
                burn ? (balance / burn).toFixed(0) : "—"
              } days of runway · expense-only forecast`}
            />
          </div>
          <div className="dashboard-charts">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Cash flow</h2>
                  <p className="subtitle">
                    Income and expenses throughout{" "}
                    {format(new Date(month + "-01T12:00:00"), "MMMM")}
                  </p>
                </div>
                <div className="legend">
                  <span>
                    <i style={{ background: "#68b69c" }} />Income
                  </span>
                  <span>
                    <i style={{ background: "#e9c0a5" }} />Expenses
                  </span>
                </div>
              </div>
              <CashChart monthly={monthly} month={month} />
              <div className="table-footer">
                <span>Grouped in three-day intervals</span>
                <button
                  className="btn ghost small-button"
                  onClick={() => navigate("analytics")}
                >
                  View analytics <Icon icon={ArrowUpRight} size={12} />
                </button>
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Spending breakdown</h2>
                  <p className="subtitle">Where your money went</p>
                </div>
                <button
                  className="icon-btn"
                  onClick={() => navigate("debits")}
                  aria-label="View expense details"
                >
                  <Icon icon={MoreHorizontal} />
                </button>
              </div>
              {top.length
                ? (
                  <>
                    <Chart
                      type="doughnut"
                      height="donut"
                      data={{
                        labels: top.map((category) => category.name),
                        datasets: [{
                          data: top.map((category) => category.total / 100),
                          backgroundColor: top.map((category) =>
                            category.colorCode
                          ),
                          hoverOffset: 5,
                        }],
                      }}
                      center={{ value: money(debits, true), label: "TOTAL SPENT" }}
                      onClick={(index) => navigate("debits")}
                    />
                    <div className="category-legend">
                      {top.map((category) => (
                        <div key={category.id}>
                          <span className="flex">
                            <i style={{ background: category.colorCode }} />
                            {category.name}
                          </span>
                          <span className="mono">
                            {Math.round(
                              category.total / Math.max(1, debits) * 100,
                            )}%
                          </span>
                        </div>
                      ))}
                      {topTotal < debits && (
                        <div className="muted">
                          Other categories: {money(debits - topTotal)}
                        </div>
                      )}
                    </div>
                  </>
                )
                : (
                  <Empty
                    title="No spending yet"
                    message="Your expense categories will appear here."
                  />
                )}
            </section>
          </div>
          <div className="dashboard-bottom">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Recent transactions</h2>
                  <p className="subtitle">Your latest household activity</p>
                </div>
                <button
                  className="btn ghost small-button"
                  onClick={() => navigate("transactions")}
                >
                  View all <Icon icon={ArrowRight} size={12} />
                </button>
              </div>
              <RecentTable
                {...props}
                entries={[...state.transactions].sort((left, right) =>
                  right.transactedAt.localeCompare(left.transactedAt)
                ).slice(0, 8)}
              />
              <div className="table-footer">
                <span className="flex gap6">
                  <Icon icon={ShieldCheck} size={12} />Every credit has a source.
                  Every debit, a destination.
                </span>
                <div className="flex gap6">
                  <button
                    className="btn ghost small-button green"
                    onClick={() => openTransaction("CREDIT")}
                    disabled={!canWrite}
                  >
                    <Icon icon={Plus} size={12} />Income
                  </button>
                  <button
                    className="btn ghost small-button red"
                    onClick={() => openTransaction("DEBIT")}
                    disabled={!canWrite}
                  >
                    <Icon icon={Plus} size={12} />Expense
                  </button>
                </div>
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Budget snapshot</h2>
                  <p className="subtitle">A little planning goes a long way</p>
                </div>
                <button
                  className="icon-btn"
                  onClick={() => navigate("budgets")}
                  aria-label="Open budget envelopes"
                >
                  <Icon icon={ArrowUpRight} size={15} />
                </button>
              </div>
              <div className="mini-budget">
                {budgets.slice(0, 4).map((budget) => {
                  const spent = categorySpent(budget.categoryId),
                    limit = toCents(budget.monthlyLimit);
                  return (
                    <div key={budget.id}>
                      <div className="between">
                        <span>
                          {lookup(state.categories, budget.categoryId)?.name}
                        </span>
                        <span className="mono">
                          <b>{money(spent, true)}</b>
                          <span className="muted">/ {money(limit, true)}</span>
                        </span>
                      </div>
                      <Progress value={spent / limit * 100} />
                    </div>
                  );
                })}
                {!budgets.length && (
                  <Empty
                    title="Plan your month"
                    message="Create spending envelopes to stay on track."
                    action={
                      <Button onClick={() => navigate("budgets")}>
                        Build a budget
                      </Button>
                    }
                  />
                )}
              </div>
              <div className="insight">
                <Icon
                  icon={overBudgets.length ? CircleAlert : Sparkles}
                  size={18}
                />
                <div>
                  <strong>
                    {overBudgets.length
                      ? `${overBudgets.length} envelope${
                        overBudgets.length > 1 ? "s" : ""
                      } over budget`
                      : net > 0
                      ? "You’re making room for tomorrow"
                      : "Keep an eye on your cash flow"}
                  </strong>
                  <p>
                    {net > 0
                      ? `You saved ${
                        credits ? (net / credits * 100).toFixed(0) : 0
                      }% of your income this month.`
                      : "Review flexible expenses to bring spending below income."}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </>
      );
    }
    function RecentTable({ state, entries, entityName, money, setModal }) {
      return entries.length
        ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>
                      <div className="flex">
                        <span
                          className={`direction ${transaction.type.toLowerCase()}`}
                        >
                          <Icon
                            icon={transaction.type === "CREDIT"
                              ? ArrowDownLeft
                              : transaction.type === "DEBIT"
                              ? ArrowUpRight
                              : ArrowLeftRight}
                            size={14}
                          />
                        </span>
                        <div>
                          <div className="merchant">{entityName(transaction)}</div>
                          <small className="muted" style={{ fontSize: 9 }}>
                            {lookup(
                              state.accounts,
                              transaction.fromAccountId || transaction.toAccountId,
                            )?.name}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="pill">
                        {lookup(state.categories, transaction.categoryId)?.name}
                      </span>
                    </td>
                    <td className="muted">
                      {format(
                        new Date(
                          String(transaction.transactedAt).slice(0, 10) +
                            "T12:00:00",
                        ),
                        "MMM d",
                      )}
                    </td>
                    <td
                      className={`money right ${
                        transaction.type === "CREDIT"
                          ? "green"
                          : transaction.type === "DEBIT"
                          ? "red"
                          : ""
                      }`}
                    >
                      {transaction.type === "CREDIT"
                        ? "+"
                        : transaction.type === "DEBIT"
                        ? "−"
                        : ""}
                      {money(toCents(transaction.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        : (
          <Empty
            title="No transactions yet"
            message="Add an account, a source or vendor, then log your first transaction."
          />
        );
    }

    function editablePayload(transaction) {
      const fields = [
        "type",
        "amount",
        "transactedAt",
        "notes",
        "receiptUrl",
        "categoryId",
        "sourceId",
        "destinationId",
        "fromAccountId",
        "toAccountId",
        "createdById",
        "allocationType",
        "splitStrategy",
        "version",
      ];
      const payload = Object.fromEntries(
        fields.filter((field) => transaction[field] !== undefined).map(
          (field) => [field, transaction[field]],
        ),
      );
      payload.splits = (transaction.splits || []).map((split) => ({
        memberId: split.memberId,
        value: transaction.splitStrategy === "EXACT_AMOUNT"
          ? split.amount
          : transaction.splitStrategy === "PERCENTAGE"
          ? asDecimal(
            Math.round(
              toCents(split.amount) / Math.max(1, toCents(transaction.amount)) *
                10000,
            ),
          )
          : undefined,
      }));
      if (transaction.splitStrategy === "PERCENTAGE" && payload.splits.length) {
        const total = payload.splits.reduce(
          (sum, split) => sum + toCents(split.value),
          0,
        );
        payload.splits[0].value = asDecimal(
          toCents(payload.splits[0].value) + 10000 - total,
        );
      }
      return payload;
    }
    function Ledger(props) {
      const {
        state,
        month,
        money,
        globalSearch,
        entityName,
        openTransaction,
        setModal,
        canWrite,
        isAdmin,
        mutation,
      } = props;
      const [search, setSearch] = useState(globalSearch),
        [direction, setDirection] = useState(""),
        [category, setCategory] = useState([]),
        [member, setMember] = useState(""),
        [allocation, setAllocation] = useState(""),
        [preset, setPreset] = useState("month"),
        [start, setStart] = useState(month + "-01"),
        [end, setEnd] = useState(""),
        [selection, setSelection] = useState({}),
        [sorting, setSorting] = useState([{ id: "transactedAt", desc: true }]);
      useEffect(() => setSearch(globalSearch), [globalSearch]);
      const entries = useMemo(() =>
        state.transactions.filter((transaction) => {
          const date = String(transaction.transactedAt).slice(0, 10),
            text = `${entityName(transaction)} ${transaction.notes || ""} ${
              lookup(state.categories, transaction.categoryId)?.name
            } ${transaction.amount}`.toLowerCase();
          const dateMatch = preset === "all" ||
            preset === "month" && inMonth(date, month) ||
            preset === "90" &&
              new Date(date).getTime() >= Date.now() - 90 * 86400000 &&
              date <= todayISO() ||
            preset === "custom" && (!start || date >= start) &&
              (!end || date <= end);
          return dateMatch && (!direction || transaction.type === direction) &&
            (!category.length || category.includes(transaction.categoryId)) &&
            (!member || transaction.createdById === member) &&
            (!allocation || transaction.allocationType === allocation) &&
            text.includes(search.toLowerCase());
        }), [
        state,
        month,
        preset,
        start,
        end,
        direction,
        category,
        member,
        allocation,
        search,
      ]);
      const canEdit = (transaction) =>
        canWrite && transaction.type !== "ADJUSTMENT" &&
        (isAdmin || transaction.createdById === state.currentMemberId);
      const columns = useMemo(() => [
        {
          id: "select",
          header: ({ table }) => (
            <input
              type="checkbox"
              aria-label="Select all filtered transactions"
              checked={table.getIsAllRowsSelected()}
              onChange={table.getToggleAllRowsSelectedHandler()}
            />
          ),
          cell: ({ row }) => (
            <input
              type="checkbox"
              aria-label={`Select ${entityName(row.original)}`}
              disabled={!row.getCanSelect()}
              checked={row.getIsSelected()}
              onChange={row.getToggleSelectedHandler()}
            />
          ),
          enableSorting: false,
        },
        {
          accessorKey: "transactedAt",
          header: "Date",
          cell: (info) => dateLabel(info.getValue()),
        },
        {
          accessorKey: "type",
          header: "Direction",
          cell: (info) => (
            <span
              className={`pill ${
                info.getValue() === "CREDIT"
                  ? "green"
                  : info.getValue() === "DEBIT"
                  ? "red"
                  : ""
              }`}
            >
              {info.getValue()}
            </span>
          ),
        },
        {
          accessorKey: "notes",
          header: "Description",
          cell: (info) => (
            <span title={info.getValue()}>
              {String(info.getValue() || "—").slice(0, 32)}
            </span>
          ),
        },
        { id: "entity", accessorFn: entityName, header: "Source / destination" },
        {
          id: "category",
          accessorFn: (transaction) =>
            lookup(state.categories, transaction.categoryId)?.name,
          header: "Category",
          cell: (info) => <span className="pill">{info.getValue()}</span>,
        },
        {
          id: "account",
          accessorFn: (transaction) =>
            `${
              lookup(
                state.accounts,
                transaction.fromAccountId || transaction.toAccountId,
              )?.name || ""
            }${
              transaction.type === "TRANSFER"
                ? ` → ${lookup(state.accounts, transaction.toAccountId)?.name}`
                : ""
            }`,
          header: "Account",
        },
        {
          id: "member",
          accessorFn: (transaction) =>
            fullName(lookup(state.members, transaction.createdById)),
          header: "Member",
          cell: ({ row }) => (
            <div className="flex gap6">
              <Avatar member={lookup(state.members, row.original.createdById)} />
              {fullName(lookup(state.members, row.original.createdById)).split(
                " ",
              )[0]}
            </div>
          ),
        },
        {
          id: "amount",
          accessorFn: (transaction) => toCents(transaction.amount),
          header: "Amount",
          cell: ({ row }) => (
            <span
              className={`money ${
                row.original.type === "CREDIT"
                  ? "green"
                  : row.original.type === "DEBIT"
                  ? "red"
                  : ""
              }`}
            >
              {row.original.type === "CREDIT"
                ? "+"
                : row.original.type === "DEBIT"
                ? "−"
                : ""}
              {money(toCents(row.original.amount))}
            </span>
          ),
        },
        {
          accessorKey: "allocationType",
          header: "Allocation",
          cell: (info) => <span className="pill">{info.getValue()}</span>,
        },
        {
          id: "status",
          header: "Status",
          cell: () => (
            <span className="green flex gap6">
              <Icon icon={CheckCheck} size={13} />Logged
            </span>
          ),
          enableSorting: false,
        },
        {
          id: "actions",
          header: "Actions",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="flex gap6">
              {row.original.receiptUrl && (
                <button
                  className="icon-btn"
                  aria-label="View receipt"
                  onClick={() => setModal({ kind: "receipt", entry: row.original })}
                >
                  <Icon icon={Receipt} size={13} />
                </button>
              )}
              {canEdit(row.original) && (
                <>
                  <button
                    className="icon-btn"
                    aria-label="Edit transaction"
                    onClick={() => openTransaction(row.original.type, row.original)}
                  >
                    <Icon icon={Pencil} size={13} />
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="Duplicate transaction"
                    onClick={() => {
                      const entry = editablePayload(row.original);
                      delete entry.version;
                      openTransaction(entry.type, {
                        ...entry,
                        transactedAt: todayISO(),
                        id: null,
                      });
                    }}
                  >
                    <Icon icon={Copy} size={13} />
                  </button>
                  <button
                    className="icon-btn red"
                    aria-label="Delete transaction"
                    onClick={() =>
                      setModal({
                        kind: "confirm",
                        title: "Delete this transaction?",
                        message:
                          "The entry is soft-deleted on the server and its balance movement is reversed. This action is audited.",
                        operations: [{
                          method: "DELETE",
                          endpoint: `/transactions/${row.original.id}`,
                          payload: { version: row.original.version },
                        }],
                      })}
                  >
                    <Icon icon={Trash2} size={13} />
                  </button>
                </>
              )}
            </div>
          ),
        },
      ], [state, canWrite, isAdmin, month]);
      const table = useReactTable({
        data: entries,
        columns,
        state: { sorting, rowSelection: selection },
        onSortingChange: setSorting,
        onRowSelectionChange: setSelection,
        getRowId: (row) => row.id,
        enableRowSelection: (row) => canEdit(row.original),
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: { pagination: { pageSize: 15 } },
      });
      useEffect(() => {
        table.setPageIndex(0);
        setSelection({});
      }, [
        month,
        preset,
        start,
        end,
        search,
        direction,
        member,
        allocation,
        category.join(","),
      ]);
      const selected = table.getSelectedRowModel().rows.map((row) => row.original),
        incoming = sumMoney(
          entries.filter((transaction) => transaction.type === "CREDIT"),
        ),
        outgoing = sumMoney(
          entries.filter((transaction) => transaction.type === "DEBIT"),
        );
      return (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Master ledger</h2>
              <p className="subtitle">
                Directional attribution · sortable columns · household audit trail
              </p>
            </div>
            <div className="flex">
              <Button
                icon={Upload}
                onClick={() => setModal({ kind: "import" })}
                disabled={!canWrite}
              >
                Import CSV
              </Button>
              <Button
                icon={Download}
                onClick={() => exportCSV(entries, state, "filtered-ledger.csv")}
              >
                Export filtered
              </Button>
            </div>
          </div>
          <div className="filters">
            <input
              type="search"
              aria-label="Search ledger"
              placeholder="Search merchant, notes, amount…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              aria-label="Date preset"
              value={preset}
              onChange={(event) => setPreset(event.target.value)}
            >
              <option value="month">Selected month</option>
              <option value="90">Last 90 days</option>
              <option value="all">All time</option>
              <option value="custom">Custom dates</option>
            </select>
            {preset === "custom" && (
              <>
                <input
                  type="date"
                  aria-label="From date"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
                <input
                  type="date"
                  aria-label="To date"
                  value={end}
                  min={start}
                  onChange={(event) => setEnd(event.target.value)}
                />
              </>
            )}
            <select
              aria-label="Transaction direction"
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
            >
              <option value="">All directions</option>
              {["CREDIT", "DEBIT", "TRANSFER", "ADJUSTMENT"].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <select
              aria-label="Household member"
              value={member}
              onChange={(event) => setMember(event.target.value)}
            >
              <SelectOptions
                items={state.members}
                label={fullName}
                placeholder="All members"
              />
            </select>
            <select
              aria-label="Allocation filter"
              value={allocation}
              onChange={(event) => setAllocation(event.target.value)}
            >
              <option value="">All allocations</option>
              {["SHARED", "SPLIT", "INDIVIDUAL"].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <details>
              <summary className="btn small-button">
                <Icon icon={SlidersHorizontal} size={13} />Categories{" "}
                {category.length ? `(${category.length})` : ""}
              </summary>
              <div
                className="stack"
                style={{ padding: 12, maxHeight: 220, overflow: "auto" }}
              >
                {state.categories.map((item) => (
                  <label className="check-label" key={item.id}>
                    <input
                      type="checkbox"
                      checked={category.includes(item.id)}
                      onChange={(event) =>
                        setCategory((items) =>
                          event.target.checked
                            ? [...items, item.id]
                            : items.filter((id) =>
                              id !== item.id
                            )
                        )}
                    />
                    {item.name}
                  </label>
                ))}
              </div>
            </details>
          </div>
          {selected.length > 0 && (
            <div className="notice" style={{ margin: 15 }}>
              <span>{selected.length} selected</span>
              <div className="flex">
                <Button
                  onClick={() =>
                    setModal({
                      kind: "confirm",
                      title: "Mark selected entries as shared?",
                      message:
                        "Splits on the selected entries are removed. Each update is individually atomic; completed updates remain if a later row fails.",
                      operations: selected.map((transaction) => ({
                        method: "PATCH",
                        endpoint: `/transactions/${transaction.id}`,
                        payload: {
                          ...editablePayload(transaction),
                          allocationType: "SHARED",
                          splitStrategy: "SOLE_RESPONSIBILITY",
                          splits: [],
                        },
                      })),
                    })}
                >
                  Mark shared
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    setModal({
                      kind: "confirm",
                      title: "Delete selected transactions?",
                      message:
                        "Each deletion reverses its account movement. Changes are individually atomic and audited.",
                      operations: selected.map((transaction) => ({
                        method: "DELETE",
                        endpoint: `/transactions/${transaction.id}`,
                        payload: { version: transaction.version },
                      })),
                    })}
                >
                  Delete selected
                </Button>
              </div>
            </div>
          )}
          {entries.length
            ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    {table.getHeaderGroups().map((group) => (
                      <tr key={group.id}>
                        {group.headers.map((header) => (
                          <th key={header.id}>
                            {header.column.getCanSort()
                              ? (
                                <button
                                  className="icon-btn"
                                  onClick={header.column.getToggleSortingHandler()}
                                  style={{ fontSize: 10, padding: 0, gap: 5 }}
                                >
                                  {flexRender(
                                    header.column.columnDef.header,
                                    header.getContext(),
                                  )}
                                  {header.column.getIsSorted() === "asc"
                                    ? "↑"
                                    : header.column.getIsSorted() === "desc"
                                    ? "↓"
                                    : ""}
                                </button>
                              )
                              : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => (
                      <tr key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
            : (
              <Empty
                title="No matching transactions"
                message="Try another date range or remove a filter."
              />
            )}
          <div className="table-footer">
            <span>
              {entries.length} records <span style={{ margin: "0 8px" }}>·</span>
              <span className="green">In {money(incoming)}</span>{" "}
              <span style={{ margin: "0 8px" }}>·</span>
              <span className="red">Out {money(outgoing)}</span>{" "}
              <span style={{ margin: "0 8px" }}>·</span>Net{" "}
              <b className="money">{money(incoming - outgoing)}</b>
            </span>
            <div className="flex">
              <span>
                Page {table.getState().pagination.pageIndex + 1} of{" "}
                {Math.max(1, table.getPageCount())}
              </span>
              <button
                className="icon-btn"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
                aria-label="Previous page"
              >
                <Icon icon={ChevronLeft} size={14} />
              </button>
              <button
                className="icon-btn"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
                aria-label="Next page"
              >
                <Icon icon={ChevronRight} size={14} />
              </button>
            </div>
          </div>
        </section>
      );
    }
    function IncomeHub(props) {
      const { state, monthly, money, setModal, openTransaction, canWrite } = props;
      const streams = state.sources.map((source) => ({
        ...source,
        monthly: sumMoney(
          monthly.filter((transaction) => transaction.sourceId === source.id),
        ),
        entries: state.transactions.filter((transaction) =>
          transaction.type === "CREDIT" && transaction.sourceId === source.id
        ),
      }));
      const upcoming = state.recurring.filter((rule) =>
        rule.type === "CREDIT" && rule.active
      );
      return (
        <div className="stack">
          <div className="between">
            <div className="flex">
              <span className="pill green">
                <span className="dot" />
                {streams.length} income streams
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                This month:{" "}
                <strong className="money green">
                  {money(
                    sumMoney(
                      monthly.filter((transaction) =>
                        transaction.type === "CREDIT"
                      ),
                    ),
                  )}
                </strong>
              </span>
            </div>
            <Button
              icon={Plus}
              variant="primary"
              disabled={!canWrite}
              onClick={() => setModal({ kind: "resource", resource: "sources" })}
            >
              Add income source
            </Button>
          </div>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Income stream breakdown</h2>
                <p className="subtitle">
                  Monthly contributions by verified origin entity
                </p>
              </div>
              <Button
                icon={Plus}
                disabled={!canWrite}
                onClick={() => openTransaction("CREDIT")}
              >
                Log credit
              </Button>
            </div>
            {streams.length
              ? (
                <Chart
                  data={{
                    labels: streams.map((source) => source.name),
                    datasets: [{
                      label: "Income",
                      data: streams.map((source) => source.monthly / 100),
                      backgroundColor: streams.map((source, index) =>
                        COLORS[index % COLORS.length]
                      ),
                      borderRadius: 5,
                      barThickness: 25,
                    }],
                  }}
                  options={{ indexAxis: "y" }}
                />
              )
              : (
                <Empty
                  title="Your first income stream"
                  message="Add your employer, freelance clients, gift origins, or refund channels."
                />
              )}
          </section>
          <div className="grid3">
            {streams.map((source) => {
              const total = sumMoney(source.entries);
              return (
                <section className="card entity-card" key={source.id}>
                  <div className="between">
                    <span className="icon-tile">
                      <Icon icon={BriefcaseBusiness} size={20} />
                    </span>
                    <span className="pill green">
                      {source.isRecurring ? "Recurring" : "Occasional"}
                    </span>
                  </div>
                  <div>
                    <h2>{source.name}</h2>
                    <p className="subtitle">
                      {source.taxTag || "No tax tag assigned"}
                    </p>
                  </div>
                  <div className="amount money green">
                    {money(total)}
                    <small
                      className="muted"
                      style={{
                        display: "block",
                        fontFamily: "Inter",
                        letterSpacing: 0,
                        fontSize: 10,
                      }}
                    >
                      All-time contribution
                    </small>
                  </div>
                  <div className="meta">
                    <div>
                      <small>Average credit</small>
                      <span className="money">
                        {money(
                          source.entries.length
                            ? Math.round(total / source.entries.length)
                            : 0,
                        )}
                      </span>
                    </div>
                    <div>
                      <small>Deposit account</small>
                      {lookup(state.accounts, source.entries[0]?.toAccountId)
                        ?.name || "Not linked yet"}
                    </div>
                  </div>
                  <div className="actions">
                    <Button
                      icon={Pencil}
                      disabled={!canWrite}
                      onClick={() =>
                        setModal({
                          kind: "resource",
                          resource: "sources",
                          entry: source,
                        })}
                    >
                      Edit source
                    </Button>
                    <Button
                      icon={ArrowDownLeft}
                      disabled={!canWrite}
                      onClick={() =>
                        openTransaction("CREDIT", { sourceId: source.id })}
                    >
                      Log income
                    </Button>
                  </div>
                </section>
              );
            })}
          </div>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Receivables & incoming</h2>
                <p className="subtitle">
                  Anticipated credits are forecasts, not bank balances
                </p>
              </div>
              <Button
                icon={CalendarDays}
                disabled={!canWrite}
                onClick={() => setModal({ kind: "schedule", type: "CREDIT" })}
              >
                Schedule income
              </Button>
            </div>
            {upcoming.length
              ? (
                <div className="list">
                  {upcoming.map((rule) => (
                    <div className="list-row" key={rule.id}>
                      <div className="flex">
                        <span className="direction">
                          <Icon icon={ArrowDownLeft} size={15} />
                        </span>
                        <div>
                          <strong>{rule.title}</strong>
                          <div className="muted">
                            {rule.sourceOrPayee} · Expected{" "}
                            {dateLabel(rule.nextDueDate)}
                          </div>
                        </div>
                      </div>
                      <div className="flex">
                        <span className="money green">
                          {money(toCents(rule.amount))}
                        </span>
                        <Button
                          disabled={!canWrite}
                          onClick={() =>
                            setModal({
                              kind: "confirm",
                              title: "Confirm incoming credit?",
                              message:
                                "Only confirm after the money reaches the deposit account. The schedule advances once.",
                              operations: [{
                                method: "POST",
                                endpoint: `/recurring/${rule.id}/post`,
                                payload: { dueDate: rule.nextDueDate },
                              }],
                            })}
                        >
                          Mark received
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )
              : (
                <Empty
                  title="No scheduled credits"
                  message="Add a recurring income schedule to forecast your next deposit."
                />
              )}
          </section>
        </div>
      );
    }
    function ExpenseHub(props) {
      const { state, monthly, money, setModal, canWrite, isAdmin, categoryStats } =
        props;
      const [search, setSearch] = useState(""),
        [classification, setClassification] = useState("all");
      const debits = monthly.filter((transaction) =>
        transaction.type === "DEBIT" &&
        (classification === "all" ||
          lookup(state.categories, transaction.categoryId)?.essential ===
            (classification === "fixed"))
      );
      const vendors = state.destinations.filter((payee) =>
        payee.name.toLowerCase().includes(search.toLowerCase())
      ).map((payee) => ({
        ...payee,
        entries: debits.filter((transaction) =>
          transaction.destinationId === payee.id
        ),
      })).sort((left, right) => sumMoney(right.entries) - sumMoney(left.entries));
      const total = sumMoney(debits),
        essential = categoryStats.filter((category) => category.essential).reduce(
          (sum, category) => sum + category.total,
          0,
        ),
        discretionary = categoryStats.filter((category) => !category.essential)
          .reduce((sum, category) => sum + category.total, 0);
      const weighted = vendors.filter((payee) => payee.entries.length).slice(0, 9);
      return (
        <div className="stack">
          <div className="between wrap">
            <div className="tabs">
              {[["all", "All expenses"], ["fixed", "Essential / fixed"], [
                "flexible",
                "Discretionary",
              ]].map(([value, label]) => (
                <button
                  key={value}
                  className={classification === value ? "active" : ""}
                  onClick={() => setClassification(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex">
              <Button
                icon={ArrowLeftRight}
                disabled={!isAdmin}
                onClick={() => setModal({ kind: "merge" })}
              >
                Merge vendors
              </Button>
              <Button
                icon={Plus}
                variant="primary"
                disabled={!canWrite}
                onClick={() =>
                  setModal({ kind: "resource", resource: "destinations" })}
              >
                Add destination
              </Button>
            </div>
          </div>
          <div className="grid2">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Destination concentration</h2>
                  <p className="subtitle">
                    Payees weighted by monthly outflow · {money(total)}
                  </p>
                </div>
                <Icon icon={ShoppingBag} size={19} />
              </div>
              {weighted.length
                ? (
                  <div className="treemap">
                    {weighted.map((payee, index) => (
                      <button
                        className="treemap-item"
                        key={payee.id}
                        style={{
                          background: COLORS[index % COLORS.length],
                          flex: `${
                            Math.max(
                              .25,
                              sumMoney(payee.entries) / Math.max(1, total) * 5,
                            )
                          } 1 ${
                            Math.max(
                              110,
                              sumMoney(payee.entries) / Math.max(1, total) * 400,
                            )
                          }px`,
                        }}
                        onClick={() => setSearch(payee.name)}
                      >
                        <strong>{payee.name}</strong>
                        <span className="money">
                          {money(sumMoney(payee.entries), true)}
                        </span>
                        <small>
                          {(sumMoney(payee.entries) / Math.max(1, total) * 100)
                            .toFixed(1)}% of filtered outflow
                        </small>
                      </button>
                    ))}
                  </div>
                )
                : (
                  <Empty
                    title="No expenses in this view"
                    message="Log a debit or change the reporting month."
                  />
                )}
            </section>
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Needs & wants</h2>
                  <p className="subtitle">
                    Category-based classification, editable in settings
                  </p>
                </div>
              </div>
              <Chart
                type="doughnut"
                height="donut"
                data={{
                  labels: ["Essential", "Discretionary"],
                  datasets: [{
                    data: [essential / 100, discretionary / 100],
                    backgroundColor: ["#7186d5", "#efbb77"],
                  }],
                }}
                center={{
                  value: `${
                    Math.round(
                      essential / Math.max(1, essential + discretionary) * 100,
                    )
                  }%`,
                  label: "ESSENTIAL",
                }}
              />
              <div className="category-legend">
                <div>
                  <span>Essential obligations</span>
                  <span className="money">{money(essential)}</span>
                </div>
                <div>
                  <span>Discretionary spending</span>
                  <span className="money">{money(discretionary)}</span>
                </div>
              </div>
            </section>
          </div>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Vendor directory</h2>
                <p className="subtitle">
                  Automatic category suggestions from each vendor’s default category
                </p>
              </div>
              <input
                aria-label="Search vendors"
                placeholder="Find a vendor…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                style={{
                  padding: 8,
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  background: "var(--surface)",
                  color: "var(--text)",
                }}
              />
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Destination</th>
                    <th>Default category</th>
                    <th>Transactions</th>
                    <th>Monthly spend</th>
                    <th>Average debit</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((payee) => (
                    <tr key={payee.id}>
                      <td>
                        <strong>{payee.name}</strong>
                      </td>
                      <td>
                        <span className="pill">
                          {lookup(state.categories, payee.defaultCategoryId)
                            ?.name || "Unassigned"}
                        </span>
                      </td>
                      <td>{payee.entries.length}</td>
                      <td className="money red">
                        {money(sumMoney(payee.entries))}
                      </td>
                      <td className="money">
                        {money(
                          payee.entries.length
                            ? Math.round(
                              sumMoney(payee.entries) / payee.entries.length,
                            )
                            : 0,
                        )}
                      </td>
                      <td>
                        <Button
                          icon={Pencil}
                          disabled={!canWrite}
                          onClick={() =>
                            setModal({
                              kind: "resource",
                              resource: "destinations",
                              entry: payee,
                            })}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!vendors.length && (
              <Empty
                title="No matching vendors"
                message="Create a destination or try a different name."
              />
            )}
          </section>
        </div>
      );
    }
    function Budgets(props) {
      const {
        state,
        month,
        money,
        budgets,
        categorySpent,
        credits,
        setModal,
        isAdmin,
      } = props;
      const allocated = sumMoney(budgets, "monthlyLimit"),
        spent = budgets.reduce(
          (sum, budget) => sum + categorySpent(budget.categoryId),
          0,
        );
      return (
        <div className="stack">
          <div className="kpi-grid">
            <KPI
              label="Budgeted for the month"
              value={money(allocated)}
              icon={Wallet}
            />
            <KPI
              label="Spent in envelopes"
              value={money(spent)}
              icon={TrendingDown}
              color="#e16a72"
            />
            <KPI
              label="Remaining in envelopes"
              value={money(allocated - spent)}
              icon={PiggyBank}
              featured
            />
            <KPI
              label="Unassigned income"
              value={money(credits - allocated)}
              icon={Target}
              footer="Logged monthly income less budget caps"
            />
          </div>
          <div className="between wrap">
            <div>
              <h2>Spending envelopes</h2>
              <p className="subtitle">Green ≤70% · Amber 71–90% · Red above 90%</p>
            </div>
            <div className="flex">
              <Button
                icon={ArrowRight}
                disabled={!isAdmin || !budgets.length}
                onClick={() => setModal({ kind: "rollover" })}
              >
                Rollover month
              </Button>
              <Button
                icon={Plus}
                variant="primary"
                disabled={!isAdmin}
                onClick={() => setModal({ kind: "resource", resource: "budgets" })}
              >
                Create envelope
              </Button>
            </div>
          </div>
          {budgets.length
            ? (
              <div className="grid3">
                {budgets.map((budget) => {
                  const category = lookup(state.categories, budget.categoryId),
                    used = categorySpent(budget.categoryId),
                    limit = toCents(budget.monthlyLimit),
                    percent = used / limit * 100;
                  return (
                    <section
                      className={`card entity-card budget-card ${
                        percent > 100 ? "over-budget" : ""
                      }`}
                      key={budget.id}
                    >
                      <div className="between">
                        <div className="flex">
                          <span
                            className="icon-tile"
                            style={{
                              color: category?.colorCode,
                              background: `${category?.colorCode}15`,
                            }}
                          >
                            <Icon icon={Wallet} size={18} />
                          </span>
                          <h2>{category?.name}</h2>
                        </div>
                        <span
                          className={`pill ${
                            percent > 90 ? "red" : percent <= 70 ? "green" : "amber"
                          }`}
                        >
                          {percent.toFixed(0)}%
                        </span>
                      </div>
                      <div>
                        <div className="budget-total">
                          <strong className={`money ${percent > 100 ? "red" : ""}`}>
                            {money(used)}
                          </strong>
                          <small className="muted">of {money(limit)}</small>
                        </div>
                        <p className="subtitle">
                          {percent > 100
                            ? "Above the spending limit"
                            : "Monthly spending utilization"}
                        </p>
                      </div>
                      <div>
                        <Progress value={percent} />
                        <p
                          className={`remaining ${used > limit ? "red" : "muted"}`}
                        >
                          {used > limit
                            ? `${money(used - limit)} over budget`
                            : `${money(limit - used)} remaining`}
                        </p>
                      </div>
                      <div className="between">
                        <span className="pill">
                          {budget.rollover
                            ? "Surplus rolls over"
                            : "Fresh start next month"}
                        </span>
                        <Button
                          icon={Pencil}
                          disabled={!isAdmin}
                          onClick={() =>
                            setModal({
                              kind: "resource",
                              resource: "budgets",
                              entry: budget,
                            })}
                        >
                          Edit
                        </Button>
                      </div>
                    </section>
                  );
                })}
              </div>
            )
            : (
              <section className="card">
                <Empty
                  title="Build a little breathing room"
                  message="Set a monthly limit for each expense category to get live threshold alerts."
                  action={
                    <Button
                      icon={Plus}
                      disabled={!isAdmin}
                      onClick={() =>
                        setModal({ kind: "resource", resource: "budgets" })}
                    >
                      Create first envelope
                    </Button>
                  }
                />
              </section>
            )}
          <div className="notice">
            <div className="flex">
              <Icon icon={ShieldCheck} size={18} />
              <span>
                Budgets are planning envelopes, not extra cash. Goal allocations
                always stay backed by a real account.
              </span>
            </div>
          </div>
        </div>
      );
    }
    function Recurring(props) {
      const { state, month, money, setModal, canWrite } = props;
      const active = state.recurring.filter((rule) => rule.active),
        due = active.filter((rule) => inMonth(rule.nextDueDate, month));
      const annual = (rule) =>
        toCents(rule.amount) *
        ({ WEEKLY: 52, MONTHLY: 12, QUARTERLY: 4, ANNUALLY: 1 }[rule.frequency] ||
          0);
      const imminent = active.filter((rule) =>
        rule.type === "DEBIT" &&
        String(rule.nextDueDate).slice(0, 10) >= todayISO() &&
        new Date(rule.nextDueDate).getTime() < Date.now() + 7 * 86400000
      );
      const overdue = active.filter((rule) =>
        String(rule.nextDueDate).slice(0, 10) < todayISO()
      );
      const first = new Date(month + "-01T12:00:00"),
        days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(),
        offset = (first.getDay() + 6) % 7;
      return (
        <div className="stack">
          <div className="notice warning">
            <div className="flex">
              <Icon icon={CalendarDays} size={19} />
              <span>
                <strong>{money(sumMoney(imminent))}</strong>{" "}
                in obligations over the next 7 days. {overdue.length
                  ? `${overdue.length} schedule(s) need overdue review.`
                  : "A quick account check keeps surprises away."}
              </span>
            </div>
            <Button
              icon={Plus}
              disabled={!canWrite}
              onClick={() => setModal({ kind: "schedule" })}
            >
              New schedule
            </Button>
          </div>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>{format(first, "MMMM yyyy")} payment calendar</h2>
                <p className="subtitle">
                  Schedules are not auto-posted. Confirm only after payment clears.
                </p>
              </div>
              <div className="legend">
                <span>
                  <i style={{ background: "#e16a72" }} />Debit
                </span>
                <span>
                  <i style={{ background: "#169979" }} />Credit
                </span>
              </div>
            </div>
            <div className="calendar">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div className="calendar-heading" key={day}>{day}</div>
              ))}
              {Array.from({ length: offset + days }, (_, index) => {
                const day = index - offset + 1,
                  date = `${month}-${String(day).padStart(2, "0")}`;
                return day < 1
                  ? <div className="calendar-cell empty" key={index} />
                  : (
                    <div
                      className={`calendar-cell ${
                        date === todayISO() ? "today" : ""
                      }`}
                      key={index}
                    >
                      <span>{day}</span>
                      {due.filter((rule) =>
                        Number(String(rule.nextDueDate).slice(8, 10)) === day
                      ).map((rule) => (
                        <button
                          className={`calendar-event ${rule.type.toLowerCase()}`}
                          key={rule.id}
                          title={`${rule.title}: ${money(toCents(rule.amount))}`}
                          onClick={() =>
                            setModal({ kind: "schedule", entry: rule })}
                        >
                          {rule.title} · {money(toCents(rule.amount), true)}
                        </button>
                      ))}
                    </div>
                  );
              })}
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Subscription & commitment audit</h2>
                <p className="subtitle">
                  Six months without review is a reminder—not proof of an unused
                  subscription.
                </p>
              </div>
              <span className="pill">
                {money(
                  active.filter((rule) => rule.type === "DEBIT").reduce(
                    (sum, rule) => sum + annual(rule),
                    0,
                  ),
                  true,
                )} / year
              </span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Schedule</th>
                    <th>Cadence</th>
                    <th>Next due</th>
                    <th>Amount</th>
                    <th>Annual equivalent</th>
                    <th>Review status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {state.recurring.map((rule) => {
                    const stale = differenceInCalendarMonths(
                      new Date(),
                      new Date(rule.lastReviewedAt),
                    ) >= 6;
                    return (
                      <tr key={rule.id}>
                        <td>
                          <strong>{rule.title}</strong>
                          <div className="muted">{rule.sourceOrPayee}</div>
                        </td>
                        <td>{rule.frequency}</td>
                        <td>{dateLabel(rule.nextDueDate)}</td>
                        <td
                          className={`money ${
                            rule.type === "CREDIT" ? "green" : "red"
                          }`}
                        >
                          {money(toCents(rule.amount))}
                        </td>
                        <td className="money">{money(annual(rule))}</td>
                        <td>
                          <span className={`pill ${stale ? "amber" : "green"}`}>
                            {!rule.active
                              ? "Paused"
                              : stale
                              ? "Review recommended"
                              : "Reviewed"}
                          </span>
                        </td>
                        <td>
                          <div className="flex gap6">
                            <Button
                              disabled={!canWrite || !rule.active}
                              onClick={() =>
                                setModal({
                                  kind: "confirm",
                                  title: `Confirm ${
                                    rule.type === "CREDIT" ? "receipt" : "payment"
                                  }?`,
                                  message: `${rule.title} · ${
                                    money(toCents(rule.amount))
                                  }. Post only after it clears. This advances the schedule once without automatic backfilling.`,
                                  operations: [{
                                    method: "POST",
                                    endpoint: `/recurring/${rule.id}/post`,
                                    payload: { dueDate: rule.nextDueDate },
                                  }],
                                })}
                            >
                              Post
                            </Button>
                            <button
                              className="icon-btn"
                              aria-label="Edit schedule"
                              disabled={!canWrite}
                              onClick={() =>
                                setModal({ kind: "schedule", entry: rule })}
                            >
                              <Icon icon={Pencil} size={14} />
                            </button>
                            {stale && (
                              <button
                                className="icon-btn"
                                disabled={!canWrite}
                                aria-label="Mark reviewed"
                                onClick={() =>
                                  setModal({
                                    kind: "confirm",
                                    title: "Mark subscription reviewed?",
                                    message:
                                      "Confirm that you checked this recurring charge and still need the service.",
                                    operations: [{
                                      method: "POST",
                                      endpoint: `/recurring/${rule.id}/review`,
                                      payload: {},
                                    }],
                                  })}
                              >
                                <Icon icon={Check} size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!state.recurring.length && (
              <Empty
                title="No recurring schedules"
                message="Add bills and income schedules to forecast upcoming obligations."
              />
            )}
          </section>
        </div>
      );
    }
    function Family(props) {
      const { state, money, setModal, canWrite, isAdmin, monthly } = props;
      const net = clearing(state),
        shared = monthly.filter((transaction) =>
          transaction.type === "DEBIT" &&
          transaction.allocationType !== "INDIVIDUAL"
        ),
        personal = monthly.filter((transaction) =>
          transaction.type === "DEBIT" &&
          transaction.allocationType === "INDIVIDUAL"
        );
      const [filter, setFilter] = useState("SHARED");
      const entries = monthly.filter((transaction) =>
        transaction.type === "DEBIT" &&
        (filter === "SHARED"
          ? transaction.allocationType !== "INDIVIDUAL"
          : transaction.allocationType === "INDIVIDUAL")
      );
      return (
        <div className="stack">
          <div className="grid3">
            <KPI
              label="Shared monthly spending"
              value={money(sumMoney(shared))}
              icon={Users}
              featured
            />
            <KPI
              label="Personal discretionary"
              value={money(sumMoney(personal))}
              icon={Wallet}
            />
            <KPI
              label="Outstanding settlements"
              value={money(
                net.transfers.reduce(
                  (sum, transfer) => sum + toCents(transfer.amount),
                  0,
                ),
              )}
              icon={ArrowLeftRight}
              footer="Internal liabilities, not additional bank expense"
            />
          </div>
          <div className="grid2">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Settle with clarity</h2>
                  <p className="subtitle">
                    Net balance clearing across the household
                  </p>
                </div>
                <Icon icon={ArrowLeftRight} size={19} />
              </div>
              {net.transfers.length
                ? (
                  <div className="list">
                    {net.transfers.map((transfer, index) => (
                      <div className="list-row" key={index}>
                        <div className="flex">
                          <Avatar
                            member={lookup(state.members, transfer.fromMemberId)}
                          />
                          <div>
                            <strong>
                              {fullName(
                                lookup(state.members, transfer.fromMemberId),
                              )}
                            </strong>
                            <div className="muted">
                              owes{" "}
                              {fullName(lookup(state.members, transfer.toMemberId))}
                              {" "}
                              <span className="money">
                                {money(toCents(transfer.amount))}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="primary"
                          disabled={!canWrite ||
                            !isAdmin &&
                              transfer.fromMemberId !== state.currentMemberId}
                          onClick={() =>
                            setModal({ kind: "settle", transfer })}
                        >
                          Settle up
                        </Button>
                      </div>
                    ))}
                  </div>
                )
                : (
                  <Empty
                    title="All square"
                    message="Your household has no outstanding split liabilities."
                  />
                )}
              <div className="insight">
                <Icon icon={ShieldCheck} />
                <div>
                  Settlement confirms an external member-to-member payment. It never
                  changes household bank balances; log an account transfer
                  separately if needed.
                </div>
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Household members</h2>
                  <p className="subtitle">
                    Admin, contributor, and viewer permissions
                  </p>
                </div>
                <Button
                  icon={Plus}
                  disabled={!isAdmin}
                  onClick={() => setModal({ kind: "member" })}
                >
                  Add member
                </Button>
              </div>
              <div className="list">
                {state.members.map((member) => (
                  <div className="list-row" key={member.id}>
                    <div className="flex">
                      <Avatar member={member} />
                      <div>
                        <strong>{fullName(member)}</strong>
                        <div className="muted">{member.user.email}</div>
                      </div>
                    </div>
                    <div className="right">
                      <span className="pill">{member.role}</span>
                      <div
                        className={`money ${
                          net.balances[member.id] > 0
                            ? "green"
                            : net.balances[member.id] < 0
                            ? "red"
                            : "muted"
                        }`}
                        style={{ marginTop: 5 }}
                      >
                        {money(net.balances[member.id])}
                      </div>
                      {isAdmin && (
                        <button
                          className="btn ghost small-button"
                          onClick={() =>
                            setModal({ kind: "member", entry: member })}
                        >
                          Manage role
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Allocation ledger</h2>
                <p className="subtitle">
                  Shared pool, equal / percentage / exact splits, or personal
                  responsibility
                </p>
              </div>
              <div className="tabs">
                <button
                  className={filter === "SHARED" ? "active" : ""}
                  onClick={() => setFilter("SHARED")}
                >
                  Shared & split
                </button>
                <button
                  className={filter === "INDIVIDUAL" ? "active" : ""}
                  onClick={() => setFilter("INDIVIDUAL")}
                >
                  Personal
                </button>
              </div>
            </div>
            <RecentTable {...props} entries={entries} />
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Settlement confirmations</h2>
              <span className="pill">{state.settlements.length} receipts</span>
            </div>
            {state.settlements.length
              ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Paid by</th>
                        <th>Received by</th>
                        <th>Amount</th>
                        <th>Confirmation note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...state.settlements].reverse().map((settlement) => (
                        <tr key={settlement.id}>
                          <td>{dateLabel(settlement.settledAt)}</td>
                          <td>
                            {fullName(
                              lookup(state.members, settlement.fromMemberId),
                            )}
                          </td>
                          <td>
                            {fullName(lookup(state.members, settlement.toMemberId))}
                          </td>
                          <td className="money green">
                            {money(toCents(settlement.amount))}
                          </td>
                          <td>{settlement.notes || "Payment confirmed"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
              : (
                <Empty
                  title="No settlements recorded"
                  message="Confirmed payments will appear here."
                />
              )}
          </section>
        </div>
      );
    }
    function Goals(props) {
      const { state, money, setModal, isAdmin, canWrite } = props;
      const reserved = sumMoney(state.goals, "currentAmount"),
        target = sumMoney(state.goals, "targetAmount");
      return (
        <div className="stack">
          <div className="between wrap">
            <div>
              <h2>Small steps. Meaningful milestones.</h2>
              <p className="subtitle">
                {money(reserved)} earmarked toward {money(target)} in goals
              </p>
            </div>
            <Button
              icon={Plus}
              variant="primary"
              disabled={!isAdmin}
              onClick={() => setModal({ kind: "resource", resource: "goals" })}
            >
              New savings goal
            </Button>
          </div>
          <div className="notice">
            <div className="flex">
              <Icon icon={PiggyBank} size={20} />
              <span>
                Virtual jars earmark existing account funds. Contributions do not
                create income, debit accounts, or increase net worth.
              </span>
            </div>
          </div>
          {state.goals.length
            ? (
              <div className="grid3">
                {state.goals.map((goal, index) => {
                  const saved = toCents(goal.currentAmount),
                    total = toCents(goal.targetAmount),
                    percent = saved / total * 100,
                    months = goal.deadline
                      ? Math.max(
                        1,
                        differenceInCalendarMonths(
                          new Date(goal.deadline),
                          new Date(),
                        ),
                      )
                      : 12,
                    required = Math.ceil((total - saved) / months),
                    color = COLORS[index % COLORS.length];
                  return (
                    <section className="card entity-card" key={goal.id}>
                      <div className="between">
                        <div>
                          <h2>{goal.name}</h2>
                          <p className="subtitle">
                            {lookup(state.accounts, goal.accountId)?.name}
                          </p>
                        </div>
                        <button
                          className="icon-btn"
                          aria-label="Edit savings goal"
                          disabled={!isAdmin}
                          onClick={() =>
                            setModal({
                              kind: "resource",
                              resource: "goals",
                              entry: goal,
                            })}
                        >
                          <Icon icon={Pencil} size={14} />
                        </button>
                      </div>
                      <div className="goal-ring">
                        <svg viewBox="0 0 120 120">
                          <circle
                            cx="60"
                            cy="60"
                            r="51"
                            fill="none"
                            stroke="var(--border)"
                            strokeWidth="8"
                          />
                          <circle
                            cx="60"
                            cy="60"
                            r="51"
                            fill="none"
                            stroke={color}
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray="320.44"
                            strokeDashoffset={320.44 *
                              (1 - Math.min(100, percent) / 100)}
                          />
                        </svg>
                        <div className="money">{percent.toFixed(0)}%</div>
                      </div>
                      <div className="between">
                        <strong className="money">{money(saved)}</strong>
                        <span className="muted" style={{ fontSize: 11 }}>
                          of {money(total)}
                        </span>
                      </div>
                      <div className="meta">
                        <div>
                          <small>Target date</small>
                          {goal.deadline
                            ? dateLabel(goal.deadline)
                            : "No fixed deadline"}
                        </div>
                        <div>
                          <small>Monthly allocation</small>
                          <span className="money">{money(required)}</span>
                        </div>
                      </div>
                      <span
                        className="pill green"
                        style={{ alignSelf: "flex-start" }}
                      >
                        <Icon icon={Sparkles} size={11} />
                        {percent >= 100
                          ? "Goal achieved!"
                          : percent >= 75
                          ? "75% milestone reached"
                          : percent >= 50
                          ? "Halfway there"
                          : percent >= 25
                          ? "25% milestone reached"
                          : "Every little bit counts"}
                      </span>
                      <div className="actions">
                        <Button
                          icon={Plus}
                          disabled={!canWrite}
                          onClick={() => setModal({ kind: "contribute", goal })}
                        >
                          Allocate funds
                        </Button>
                      </div>
                    </section>
                  );
                })}
              </div>
            )
            : (
              <section className="card">
                <Empty
                  title="Save for what comes next"
                  message="Create an emergency fund, vacation goal, or sinking fund backed by one of your accounts."
                />
              </section>
            )}
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Vault allocation</h2>
                <p className="subtitle">
                  Real account balances backing your virtual jars
                </p>
              </div>
            </div>
            <div className="list">
              {state.accounts.map((account) => {
                const allocated = sumMoney(
                    state.goals.filter((goal) => goal.accountId === account.id),
                    "currentAmount",
                  ),
                  balance = toCents(account.currentBalance);
                return (
                  <div className="list-row" key={account.id}>
                    <div>
                      <strong>{account.name}</strong>
                      <div className="muted">
                        {money(allocated)} reserved ·{" "}
                        {money(Math.max(0, balance) - allocated)} unallocated
                      </div>
                    </div>
                    <div style={{ width: 160 }}>
                      <Progress
                        value={allocated / Math.max(1, balance) * 100}
                        color="#7186d5"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      );
    }
    function Analytics(props) {
      const { state, month, money, balance, setModal, notify } = props;
      const [quarter, setQuarter] = useState(
        String(Math.floor((Number(month.slice(5)) - 1) / 3) + 1),
      );
      const history = Array.from(
        { length: 12 },
        (_, index) =>
          format(
            addMonths(new Date(month + "-01T12:00:00"), index - 11),
            "yyyy-MM",
          ),
      );
      const monthlyTotals = history.map((period) => {
        const entries = state.transactions.filter((transaction) =>
          inMonth(transaction.transactedAt, period)
        );
        return {
          month: period,
          incoming: sumMoney(
            entries.filter((transaction) => transaction.type === "CREDIT"),
          ),
          outgoing: sumMoney(
            entries.filter((transaction) => transaction.type === "DEBIT"),
          ),
          adjustments: sumMoney(
            entries.filter((transaction) => transaction.type === "ADJUSTMENT"),
          ),
        };
      });
      const labels = history.map((period) =>
        format(new Date(period + "-01T12:00:00"), "MMM")
      );
      const earliest = history[0] + "-01",
        opening = sumMoney(state.accounts, "openingBalance");
      let running = opening +
        state.transactions.filter((transaction) =>
          String(transaction.transactedAt).slice(0, 10) < earliest
        ).reduce(
          (sum, transaction) =>
            sum +
            (transaction.type === "CREDIT" || transaction.type === "ADJUSTMENT"
              ? toCents(transaction.amount)
              : transaction.type === "DEBIT"
              ? -toCents(transaction.amount)
              : 0),
          0,
        );
      const reserves = monthlyTotals.map((period) => {
        running += period.incoming - period.outgoing + period.adjustments;
        return running / 100;
      });
      const selected = monthlyTotals.at(-1),
        prior = monthlyTotals.at(-2),
        previousYear = `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`,
        priorYearDebits = sumMoney(
          state.transactions.filter((transaction) =>
            transaction.type === "DEBIT" &&
            inMonth(transaction.transactedAt, previousYear)
          ),
        );
      const heat = Array.from({ length: 5 }, () => Array(7).fill(0));
      state.transactions.filter((transaction) =>
        transaction.type === "DEBIT" && inMonth(transaction.transactedAt, month)
      ).forEach((transaction) => {
        const day = new Date(
          String(transaction.transactedAt).slice(0, 10) + "T12:00:00",
        );
        heat[Math.min(4, Math.floor((day.getDate() - 1) / 7))][
          (day.getDay() + 6) % 7
        ] += toCents(transaction.amount);
      });
      const maximum = Math.max(1, ...heat.flat()),
        rate = selected.incoming
          ? (selected.incoming - selected.outgoing) / selected.incoming * 100
          : 0;
      const quarterRows = state.transactions.filter((transaction) =>
        String(transaction.transactedAt).slice(0, 4) === month.slice(0, 4) &&
        Math.floor((Number(String(transaction.transactedAt).slice(5, 7)) - 1) / 3) +
              1 === Number(quarter)
      );
      const anomalies = state.transactions.filter((transaction) =>
        transaction.type === "DEBIT" && inMonth(transaction.transactedAt, month)
      ).filter((transaction) => {
        const comparisons = state.transactions.filter((other) =>
          other.type === "DEBIT" &&
          other.destinationId === transaction.destinationId &&
          !inMonth(other.transactedAt, month)
        );
        return comparisons.length >= 3 &&
          toCents(transaction.amount) >
            sumMoney(comparisons) / comparisons.length * 1.5;
      });
      return (
        <div className="stack">
          <div className="kpi-grid">
            <KPI
              label="Monthly savings rate"
              value={`${rate.toFixed(1)}%`}
              icon={PiggyBank}
              featured
            />
            <KPI
              label="Expense change, MoM"
              value={prior.outgoing
                ? `${
                  ((selected.outgoing - prior.outgoing) / prior.outgoing * 100)
                    .toFixed(1)
                }%`
                : "No baseline"}
              icon={TrendingDown}
            />
            <KPI
              label="Expense change, YoY"
              value={priorYearDebits
                ? `${
                  ((selected.outgoing - priorYearDebits) / priorYearDebits * 100)
                    .toFixed(1)
                }%`
                : "No prior-year data"}
              icon={CalendarDays}
            />
            <KPI
              label="Daily burn, full-month basis"
              value={money(
                Math.round(
                  selected.outgoing /
                    new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0)
                      .getDate(),
                ),
              )}
              icon={Zap}
            />
          </div>
          <div className="grid2">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>12-month cash comparison</h2>
                  <p className="subtitle">
                    Logged inflow and outflow, not predictions
                  </p>
                </div>
                <div className="legend">
                  <span>
                    <i style={{ background: "#68b69c" }} />Income
                  </span>
                  <span>
                    <i style={{ background: "#e9c0a5" }} />Expenses
                  </span>
                </div>
              </div>
              <Chart
                data={{
                  labels,
                  datasets: [{
                    label: "Income",
                    data: monthlyTotals.map((period) => period.incoming / 100),
                    backgroundColor: "#68b69c",
                    borderRadius: 4,
                  }, {
                    label: "Expenses",
                    data: monthlyTotals.map((period) => period.outgoing / 100),
                    backgroundColor: "#e9c0a5",
                    borderRadius: 4,
                  }],
                }}
              />
            </section>
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Household reserve trajectory</h2>
                  <p className="subtitle">
                    Opening balances + credits − debits + adjustments
                  </p>
                </div>
              </div>
              <Chart
                type="line"
                data={{
                  labels,
                  datasets: [{
                    label: "Reserve",
                    data: reserves,
                    borderColor: "#64b9a3",
                    backgroundColor: "#64b9a320",
                    fill: true,
                    tension: .35,
                    pointRadius: 3,
                    borderWidth: 2,
                  }],
                }}
              />
            </section>
          </div>
          <div className="grid2">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Expense velocity</h2>
                  <p className="subtitle">
                    Week-of-month by weekday · darker means greater spend
                  </p>
                </div>
              </div>
              <div className="heatmap">
                <div />
                {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                  <div className="heat-cell" key={index}>{day}</div>
                ))}
                {heat.map((week, index) => (
                  <React.Fragment key={index}>
                    <div className="heat-cell">W{index + 1}</div>
                    {week.map((amount, day) => (
                      <div
                        className="heat-cell"
                        key={day}
                        style={{
                          background: `rgba(22,153,121,${
                            .07 + amount / maximum * .8
                          })`,
                          color: amount / maximum > .6 ? "#fff" : "var(--text)",
                        }}
                        title={money(amount)}
                      >
                        {amount ? money(amount, true) : "—"}
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </section>
            <section className="card card-pad stack">
              <div>
                <h2>Custom report</h2>
                <p className="subtitle">Export the selected financial quarter</p>
              </div>
              <Field label="Reporting quarter">
                <select
                  value={quarter}
                  onChange={(event) => setQuarter(event.target.value)}
                >
                  {[1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      Q{value} {month.slice(0, 4)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="between">
                <span className="muted">{quarterRows.length} transactions</span>
                <span className="money">
                  {money(
                    sumMoney(
                      quarterRows.filter((transaction) =>
                        transaction.type === "CREDIT"
                      ),
                    ) - sumMoney(quarterRows.filter((transaction) =>
                      transaction.type === "DEBIT"
                    )),
                  )}
                </span>
              </div>
              <div className="flex">
                <Button
                  icon={Download}
                  onClick={() =>
                    exportCSV(
                      quarterRows,
                      state,
                      `household-${month.slice(0, 4)}-Q${quarter}.csv`,
                    )}
                >
                  Export CSV
                </Button>
                <Button
                  icon={FileText}
                  onClick={() =>
                    setModal({
                      kind: "report",
                      entries: quarterRows,
                      title: `Financial report · Q${quarter} ${month.slice(0, 4)}`,
                    })}
                >
                  PDF / print report
                </Button>
              </div>
              <p className="footnote">
                PDF is generated with your browser’s Print → Save as PDF. The
                preview shows only the selected quarter.
              </p>
            </section>
          </div>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Spending signals</h2>
                <p className="subtitle">
                  Charges above 150% of a vendor’s historical average (at least 3
                  prior charges)
                </p>
              </div>
              <span className="pill">{anomalies.length} signals</span>
            </div>
            <RecentTable {...props} entries={anomalies} />
            {!anomalies.length && (
              <div className="card-pad muted" style={{ fontSize: 12 }}>
                No vendor outliers in this month. This is a rule-based comparison,
                not a fraud assessment.
              </div>
            )}
          </section>
        </div>
      );
    }
    function CategoryComparison({ state, month }) {
      const [normalized, setNormalized] = useState(false);
      const periods = Array.from(
        { length: 12 },
        (_, index) =>
          format(
            addMonths(new Date(month + "-01T12:00:00"), index - 11),
            "yyyy-MM",
          ),
      );
      const categories = state.categories.filter((category) =>
        category.type === "DEBIT"
      );
      const totals = periods.map((period) =>
        sumMoney(
          state.transactions.filter((transaction) =>
            transaction.type === "DEBIT" &&
            inMonth(transaction.transactedAt, period)
          ),
        )
      );
      const datasets = categories.map((category) => ({
        label: category.name,
        backgroundColor: category.colorCode,
        borderRadius: 2,
        data: periods.map((period, index) => {
          const value = sumMoney(
            state.transactions.filter((transaction) =>
              transaction.type === "DEBIT" &&
              transaction.categoryId === category.id &&
              inMonth(transaction.transactedAt, period)
            ),
          );
          return normalized
            ? value / Math.max(1, totals[index]) * 100
            : value / 100;
        }),
      }));
      return (
        <section className="card mt">
          <div className="card-head">
            <div>
              <h2>Category spending over time</h2>
              <p className="subtitle">
                Compare monthly expense composition in dollars or normalized
                percentages
              </p>
            </div>
            <div className="tabs">
              <button
                className={!normalized ? "active" : ""}
                onClick={() => setNormalized(false)}
              >
                Amount
              </button>
              <button
                className={normalized ? "active" : ""}
                onClick={() => setNormalized(true)}
              >
                % of spending
              </button>
            </div>
          </div>
          <div className="legend wrap" style={{ padding: "0 20px 18px" }}>
            {categories.map((category) => (
              <span key={category.id}>
                <i style={{ background: category.colorCode }} />
                {category.name}
              </span>
            ))}
          </div>
          <Chart
            data={{
              labels: periods.map((period) =>
                format(new Date(period + "-01T12:00:00"), "MMM")
              ),
              datasets,
            }}
            options={{
              scales: {
                x: { stacked: true, grid: { display: false } },
                y: {
                  stacked: true,
                  beginAtZero: true,
                  ...(normalized
                    ? { max: 100, ticks: { callback: (value) => `${value}%` } }
                    : {}),
                },
              },
            }}
          />
        </section>
      );
    }
    function Accounts(props) {
      const {
        state,
        money,
        balance,
        setModal,
        openTransaction,
        isAdmin,
        canWrite,
      } = props;
      const reserved = sumMoney(state.goals, "currentAmount");
      return (
        <div className="stack">
          <div className="grid3">
            <KPI
              label="Net household liquidity"
              value={money(balance)}
              icon={Landmark}
              featured
            />
            <KPI
              label="Goal allocations"
              value={money(reserved)}
              icon={Target}
              footer="Already included in account balances"
            />
            <KPI
              label="Unallocated positive balances"
              value={money(
                state.accounts.reduce(
                  (sum, account) =>
                    sum + Math.max(0, toCents(account.currentBalance)),
                  0,
                ) - reserved,
              )}
              icon={Wallet}
              footer="Does not represent a bank credit limit"
            />
          </div>
          <div className="between">
            <div>
              <h2>Accounts & physical vaults</h2>
              <p className="subtitle">
                Checking, savings, cash wallets, and signed credit-card balances
              </p>
            </div>
            <div className="flex">
              <Button
                icon={ArrowLeftRight}
                disabled={!canWrite || state.accounts.length < 2}
                onClick={() => openTransaction("TRANSFER")}
              >
                Transfer funds
              </Button>
              <Button
                icon={Plus}
                variant="primary"
                disabled={!isAdmin}
                onClick={() => setModal({ kind: "resource", resource: "accounts" })}
              >
                Add account
              </Button>
            </div>
          </div>
          {state.accounts.length
            ? (
              <div className="grid3">
                {state.accounts.map((account, index) => {
                  const allocation = sumMoney(
                      state.goals.filter((goal) => goal.accountId === account.id),
                      "currentAmount",
                    ),
                    actual = toCents(account.currentBalance);
                  return (
                    <section
                      className="card entity-card account-card"
                      key={account.id}
                    >
                      <div className="between">
                        <span
                          className="icon-tile"
                          style={{
                            background: `${COLORS[index % COLORS.length]}18`,
                            color: COLORS[index % COLORS.length],
                          }}
                        >
                          <Icon
                            icon={account.type === "CREDIT_CARD"
                              ? CreditCard
                              : account.type === "CASH_WALLET"
                              ? Wallet
                              : Landmark}
                            size={22}
                          />
                        </span>
                        <span className="pill">
                          {account.type.replaceAll("_", " ")}
                        </span>
                      </div>
                      <div>
                        <h2>{account.name}</h2>
                        <p className="subtitle">
                          Manually tracked · no live bank connection
                        </p>
                      </div>
                      <div className={`amount money ${actual < 0 ? "red" : ""}`}>
                        {money(actual)}
                      </div>
                      <div className="meta">
                        <div>
                          <small>Unallocated balance</small>
                          <span className="money">
                            {money(actual - allocation)}
                          </span>
                        </div>
                        <div>
                          <small>Last reconciled</small>
                          {account.lastReconciledAt
                            ? dateLabel(account.lastReconciledAt)
                            : "Not yet reconciled"}
                        </div>
                      </div>
                      <div className="actions">
                        <Button
                          icon={CheckCheck}
                          disabled={!isAdmin}
                          onClick={() => setModal({ kind: "reconcile", account })}
                        >
                          Reconcile
                        </Button>
                        <Button
                          icon={ArrowLeftRight}
                          disabled={!canWrite || state.accounts.length < 2}
                          onClick={() =>
                            openTransaction("TRANSFER", {
                              fromAccountId: account.id,
                            })}
                        >
                          Transfer
                        </Button>
                      </div>
                    </section>
                  );
                })}
              </div>
            )
            : (
              <section className="card">
                <Empty
                  title="Bring your accounts together"
                  message="Add an opening balance to begin logging real directional transactions."
                  action={
                    <Button
                      icon={Plus}
                      disabled={!isAdmin}
                      onClick={() =>
                        setModal({ kind: "resource", resource: "accounts" })}
                    >
                      Add first account
                    </Button>
                  }
                />
              </section>
            )}
          <div className="notice warning">
            <Icon icon={CircleAlert} size={19} />
            <span>
              For credit cards, enter debt as a negative balance. Card purchases are
              debits; paying the card from checking is an internal transfer.
              Reconciliation differences are audit entries—not income.
            </span>
          </div>
        </div>
      );
    }

    const positiveAmountSchema = z.string().refine((value) => {
      try {
        return toCents(value, false) > 0;
      } catch {
        return false;
      }
    }, "Enter a positive amount with at most two decimal places.");
    function TransactionForm(
      { state, modal, mutate, onClose, money, isAdmin, setModal, schedule = false },
    ) {
      const entry = schedule ? modal.entry?.template || {} : modal.entry || {};
      const initialType = schedule
        ? modal.entry?.type || modal.type || "DEBIT"
        : entry.type || modal.type || "DEBIT";
      const defaultMember = isAdmin
        ? entry.createdById || state.currentMemberId
        : state.currentMemberId;
      const defaults = {
        type: initialType,
        amount: schedule ? modal.entry?.amount || "" : entry.amount || "",
        transactedAt: String(
          schedule
            ? modal.entry?.nextDueDate || todayISO()
            : entry.transactedAt || todayISO(),
        ).slice(0, 10),
        categoryId: entry.categoryId ||
          state.categories.find((category) => category.type === initialType)?.id ||
          "",
        sourceId: entry.sourceId || "",
        destinationId: entry.destinationId || "",
        fromAccountId: entry.fromAccountId || state.accounts[0]?.id || "",
        toAccountId: entry.toAccountId ||
          state.accounts[initialType === "TRANSFER" ? 1 : 0]?.id || "",
        createdById: defaultMember,
        allocationType: entry.allocationType || "SHARED",
        splitStrategy: entry.allocationType === "SPLIT"
          ? entry.splitStrategy
          : "EQUAL",
        notes: entry.notes || "",
        receiptUrl: entry.receiptUrl || "",
        title: modal.entry?.title || "",
        frequency: modal.entry?.frequency || "MONTHLY",
        active: modal.entry?.active ?? true,
      };
      const {
        register,
        handleSubmit,
        watch,
        setValue,
        formState: { errors, isSubmitting },
      } = useForm({ defaultValues: defaults });
      const type = watch("type"),
        allocation = watch("allocationType"),
        strategy = watch("splitStrategy"),
        amount = watch("amount");
      const originalSplit = entry.id
        ? editablePayload(entry).splits
        : (entry.splits || []).map((split) => ({
          memberId: split.memberId,
          value: split.value || split.amount || "0",
        }));
      const [participants, setParticipants] = useState(
        originalSplit.length
          ? originalSplit.map((split) => split.memberId)
          : state.members.map((member) => member.id),
      );
      const [weights, setWeights] = useState(
        Object.fromEntries(
          state.members.map((
            member,
            index,
          ) => [
            member.id,
            originalSplit.find((split) => split.memberId === member.id)?.value ||
            (index === 0 ? "50.00" : index === 1 ? "50.00" : "0.00"),
          ]),
        ),
      );
      const [error, setError] = useState(""),
        [readingReceipt, setReadingReceipt] = useState(false),
        submissionKey = useRef(uid());
      const categories = state.categories.filter((category) =>
        category.type === type
      );
      const setType = (next) => {
        setValue("type", next);
        setValue(
          "categoryId",
          state.categories.find((category) => category.type === next)?.id || "",
        );
        if (next !== "DEBIT") setValue("allocationType", "SHARED");
        setError("");
      };
      const upload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (
          !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            file.type,
          ) || file.size > 1000000
        ) {
          setError("Use a PNG, JPG, WebP, or GIF receipt smaller than 1 MB.");
          event.target.value = "";
          return;
        }
        setReadingReceipt(true);
        try {
          const url = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Receipt could not be read."));
            reader.readAsDataURL(file);
          });
          setValue("receiptUrl", url);
          setError("");
        } catch (error) {
          setError(error.message);
        } finally {
          setReadingReceipt(false);
        }
      };
      const submit = async (values) => {
        setError("");
        try {
          const payload = {
            type: values.type,
            amount: asDecimal(toCents(values.amount, false)),
            transactedAt: values.transactedAt + "T12:00:00.000Z",
            categoryId: values.categoryId,
            createdById: values.createdById,
            sourceId: values.type === "CREDIT" ? values.sourceId : null,
            destinationId: values.type === "DEBIT" ? values.destinationId : null,
            fromAccountId: values.type !== "CREDIT" ? values.fromAccountId : null,
            toAccountId: values.type !== "DEBIT" ? values.toAccountId : null,
            allocationType: values.type === "DEBIT"
              ? values.allocationType
              : "SHARED",
            splitStrategy:
              values.type === "DEBIT" && values.allocationType === "SPLIT"
                ? values.splitStrategy
                : "SOLE_RESPONSIBILITY",
            notes: values.notes || null,
            receiptUrl: values.receiptUrl || null,
            splits: [],
          };
          if (
            payload.type === "TRANSFER" &&
            payload.fromAccountId === payload.toAccountId
          ) throw new Error("Choose different accounts for a transfer.");
          if (
            payload.receiptUrl && !/^https:\/\//.test(payload.receiptUrl) &&
            !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(
              payload.receiptUrl,
            )
          ) {
            throw new Error(
              "Receipt must be an HTTPS URL or supported uploaded image.",
            );
          }
          if (payload.allocationType === "SPLIT") {
            payload.splits = participants.map((memberId) => ({
              memberId,
              ...(strategy !== "EQUAL" ? { value: weights[memberId] || "0" } : {}),
            }));
            distribute(
              toCents(payload.amount),
              strategy,
              payload.splits,
              state.members,
            );
          }
          if (schedule) {
            const entity = lookup(
              payload.type === "CREDIT" ? state.sources : state.destinations,
              payload.sourceId || payload.destinationId,
            );
            const recurringPayload = {
              title: values.title,
              type: payload.type,
              amount: payload.amount,
              frequency: values.frequency,
              nextDueDate: payload.transactedAt,
              sourceOrPayee: entity?.name || values.title,
              template: payload,
              active: values.active,
            };
            await mutate(
              modal.entry?.id ? "PATCH" : "POST",
              `/recurring${modal.entry?.id ? `/${modal.entry.id}` : ""}`,
              recurringPayload,
              "Schedule saved. No bank movement has been posted.",
            );
          } else {
            if (entry.id) payload.version = entry.version;
            await mutate(
              entry.id ? "PATCH" : "POST",
              `/transactions${entry.id ? `/${entry.id}` : ""}`,
              payload,
              entry.id
                ? "Transaction updated and balances recalculated."
                : "Transaction logged. Household balances are up to date.",
              submissionKey.current,
            );
          }
          onClose();
        } catch (error) {
          setError(error.message);
        }
      };
      return (
        <form onSubmit={handleSubmit(submit)}>
          <div className="modal-body">
            <div className="tabs">
              {(schedule ? ["DEBIT", "CREDIT"] : ["DEBIT", "CREDIT", "TRANSFER"])
                .map((direction) => (
                  <button
                    type="button"
                    className={type === direction ? "active" : ""}
                    key={direction}
                    onClick={() => setType(direction)}
                  >
                    {direction === "CREDIT"
                      ? "↙ Credit / income"
                      : direction === "DEBIT"
                      ? "↗ Debit / expense"
                      : "⇄ Transfer"}
                  </button>
                ))}
            </div>
            {error && <div className="inline-error" role="alert">{error}</div>}
            {!state.accounts.length && (
              <div className="notice warning" style={{ marginBottom: 16 }}>
                Create an account in Accounts & vaults before logging transactions.
              </div>
            )}
            <div className="form-grid">
              {schedule && (
                <Field label="Schedule title" full error={errors.title?.message}>
                  <input
                    {...register("title", {
                      required: "Enter a title.",
                      maxLength: 120,
                    })}
                    placeholder="e.g. Monthly rent"
                  />
                </Field>
              )}
              <Field
                label={`Amount (${state.household.currency})`}
                error={errors.amount?.message}
              >
                <input
                  className="amount-input"
                  inputMode="decimal"
                  placeholder="0.00"
                  {...register("amount", {
                    validate: (value) =>
                      positiveAmountSchema.safeParse(value).success ||
                      "Enter a positive amount with up to 2 decimal places.",
                  })}
                />
              </Field>
              <Field
                label={schedule ? "Next due date" : "Transaction date"}
                error={errors.transactedAt?.message}
              >
                <input
                  type="date"
                  {...register("transactedAt", { required: "Choose a date." })}
                  min="2000-01-01"
                  max="2200-12-31"
                />
              </Field>
              <Field label="Category" error={errors.categoryId?.message}>
                <select
                  {...register("categoryId", { required: "Select a category." })}
                >
                  <SelectOptions items={categories} />
                </select>
              </Field>
              <Field label="Payer / earner" error={errors.createdById?.message}>
                <select
                  {...register("createdById", { required: "Select a member." })}
                >
                  <SelectOptions
                    items={isAdmin
                      ? state.members
                      : state.members.filter((member) =>
                        member.id === state.currentMemberId
                      )}
                    label={fullName}
                  />
                </select>
              </Field>
              {type === "CREDIT" && (
                <Field
                  label="Income source / origin entity"
                  error={errors.sourceId?.message}
                  help="Required: who actually supplied the money."
                >
                  <select
                    {...register("sourceId", {
                      validate: (value) =>
                        watch("type") !== "CREDIT" || !!value || "Choose a source.",
                    })}
                  >
                    <SelectOptions items={state.sources} />
                  </select>
                </Field>
              )}
              {type === "DEBIT" && (
                <Field
                  label="Payee / destination entity"
                  error={errors.destinationId?.message}
                  help="Required: who received the money."
                >
                  <select
                    {...register("destinationId", {
                      validate: (value) =>
                        watch("type") !== "DEBIT" || !!value || "Choose a payee.",
                      onChange: (event) => {
                        const payee = lookup(
                          state.destinations,
                          event.target.value,
                        );
                        if (payee?.defaultCategoryId) {
                          setValue("categoryId", payee.defaultCategoryId);
                        }
                      },
                    })}
                  >
                    <SelectOptions items={state.destinations} />
                  </select>
                </Field>
              )}
              {type !== "CREDIT" && (
                <Field label="From account" error={errors.fromAccountId?.message}>
                  <select
                    {...register("fromAccountId", {
                      validate: (value) =>
                        watch("type") === "CREDIT" || !!value ||
                        "Select a payment account.",
                    })}
                  >
                    <SelectOptions items={state.accounts} />
                  </select>
                </Field>
              )}
              {type !== "DEBIT" && (
                <Field
                  label="To / deposit account"
                  error={errors.toAccountId?.message}
                >
                  <select
                    {...register("toAccountId", {
                      validate: (value) =>
                        watch("type") === "DEBIT" || !!value ||
                        "Select a deposit account.",
                    })}
                  >
                    <SelectOptions items={state.accounts} />
                  </select>
                </Field>
              )}
              {type === "DEBIT" && (
                <Field label="Allocation" full>
                  <select {...register("allocationType")}>
                    <option value="SHARED">100% shared household pool</option>
                    <option value="SPLIT">
                      Split between members (creates internal liabilities)
                    </option>
                    <option value="INDIVIDUAL">
                      Individual discretionary responsibility
                    </option>
                  </select>
                </Field>
              )}
              {type === "DEBIT" && allocation === "SPLIT" && (
                <div className="field full">
                  <Field label="Split strategy">
                    <select {...register("splitStrategy")}>
                      <option value="EQUAL">
                        Equal split (rounding remainder allocated deterministically)
                      </option>
                      <option value="PERCENTAGE">
                        Custom percentage, including 60 / 40
                      </option>
                      <option value="EXACT_AMOUNT">Exact amount per member</option>
                    </select>
                  </Field>
                  {state.members.map((member) => (
                    <div className="split-row" key={member.id}>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={participants.includes(member.id)}
                          onChange={(event) =>
                            setParticipants((items) =>
                              event.target.checked
                                ? [...items, member.id]
                                : items.filter((id) =>
                                  id !== member.id
                                )
                            )}
                        />
                        <Avatar member={member} />
                        {fullName(member)}
                      </label>
                      {strategy === "EQUAL"
                        ? (
                          <span className="muted right">
                            {participants.includes(member.id) && amount &&
                                positiveAmountSchema.safeParse(amount).success
                              ? money(
                                Math.floor(
                                  toCents(amount) /
                                    Math.max(1, participants.length),
                                ),
                              )
                              : "—"}
                          </span>
                        )
                        : (
                          <input
                            aria-label={`${fullName(member)} ${
                              strategy === "PERCENTAGE" ? "percentage" : "amount"
                            }`}
                            inputMode="decimal"
                            disabled={!participants.includes(member.id)}
                            value={weights[member.id] || ""}
                            onChange={(event) =>
                              setWeights((values) => ({
                                ...values,
                                [member.id]: event.target.value,
                              }))}
                            placeholder={strategy === "PERCENTAGE" ? "%" : "0.00"}
                          />
                        )}
                    </div>
                  ))}
                  <span className="help">
                    Each non-payer’s share is owed to the payer. The bank expense is
                    recorded only once.
                  </span>
                </div>
              )}
              {schedule && (
                <>
                  <Field label="Frequency">
                    <select {...register("frequency")}>
                      {["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"].map(
                        (value) => <option key={value}>{value}</option>,
                      )}
                    </select>
                  </Field>
                  <Field label="Schedule status">
                    <span className="check-label">
                      <input type="checkbox" {...register("active")} />Active
                      schedule
                    </span>
                  </Field>
                </>
              )}
              <Field label="Notes" full>
                <textarea
                  {...register("notes", { maxLength: 3000 })}
                  placeholder="What was this for?"
                />
              </Field>
              {!schedule && (
                <Field
                  label="Receipt (optional)"
                  full
                  help="Upload an image under 1 MB, or paste an HTTPS image URL."
                >
                  <input
                    type="url"
                    placeholder="https://…"
                    value={watch("receiptUrl").startsWith("data:")
                      ? ""
                      : watch("receiptUrl")}
                    onChange={(event) => setValue("receiptUrl", event.target.value)}
                  />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={upload}
                  />
                  {watch("receiptUrl").startsWith("data:") && (
                    <div className="between">
                      <span className="green">Receipt image attached</span>
                      <Button onClick={() => setValue("receiptUrl", "")}>
                        Remove
                      </Button>
                    </div>
                  )}
                </Field>
              )}
            </div>
            <p className="footnote mt">
              {schedule
                ? "Saving a schedule does not change balances. Post each occurrence after it clears."
                : type === "TRANSFER"
                ? "Internal transfers move money without changing total household income or expenses."
                : "Balances and allocations update atomically. Edits and deletions preserve the server audit trail."}
            </p>
          </div>
          <div className="modal-footer">
            <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
            <button
              type="submit"
              className="btn primary"
              disabled={isSubmitting || readingReceipt || !state.accounts.length}
            >
              <Icon icon={Check} size={14} />
              {isSubmitting
                ? "Saving…"
                : schedule
                ? "Save schedule"
                : entry.id
                ? "Save changes"
                : "Log transaction"}
            </button>
          </div>
        </form>
      );
    }
    function ResourceForm(
      { state, modal, mutate, onClose, month, setModal, isAdmin },
    ) {
      const { resource, entry } = modal;
      const defaults = {
        name: entry?.name || "",
        isRecurring: entry?.isRecurring || false,
        taxTag: entry?.taxTag || "",
        defaultCategoryId: entry?.defaultCategoryId || "",
        colorCode: entry?.colorCode || "#4F46E5",
        essential: entry?.essential || false,
        type: entry?.type || (resource === "accounts" ? "CHECKING" : "DEBIT"),
        openingBalance: entry?.openingBalance || "0.00",
        categoryId: entry?.categoryId || "",
        monthlyLimit: entry?.monthlyLimit || "500.00",
        rollover: entry?.rollover || false,
        targetAmount: entry?.targetAmount || "5000.00",
        deadline: String(entry?.deadline || "").slice(0, 10),
        accountId: entry?.accountId || state.accounts[0]?.id || "",
      };
      const {
        register,
        handleSubmit,
        watch,
        setValue,
        formState: { errors, isSubmitting },
      } = useForm({ defaultValues: defaults });
      const [error, setError] = useState("");
      const positive = (value) =>
        positiveAmountSchema.safeParse(value).success ||
        "Enter a positive amount with at most two decimal places.";
      const submit = async (values) => {
        setError("");
        try {
          const payloads = {
            sources: {
              name: values.name,
              isRecurring: values.isRecurring,
              taxTag: values.taxTag || null,
            },
            destinations: {
              name: values.name,
              defaultCategoryId: values.defaultCategoryId || null,
            },
            categories: {
              name: values.name,
              type: values.type,
              colorCode: values.colorCode,
              essential: values.essential,
            },
            accounts: {
              name: values.name,
              type: values.type,
              openingBalance: values.openingBalance,
            },
            budgets: {
              categoryId: values.categoryId,
              monthlyLimit: values.monthlyLimit,
              periodMonth: entry?.periodMonth || Number(month.slice(5)),
              periodYear: entry?.periodYear || Number(month.slice(0, 4)),
              rollover: values.rollover,
            },
            goals: {
              name: values.name,
              targetAmount: values.targetAmount,
              accountId: values.accountId,
              deadline: values.deadline ? values.deadline + "T12:00:00.000Z" : null,
            },
          };
          await mutate(
            entry?.id ? "PATCH" : "POST",
            `/${resource}${entry?.id ? `/${entry.id}` : ""}`,
            payloads[resource],
          );
          onClose();
        } catch (error) {
          setError(error.message);
        }
      };
      return (
        <form onSubmit={handleSubmit(submit)}>
          <div className="modal-body">
            {error && <div className="inline-error" role="alert">{error}</div>}
            <div className="form-grid">
              {resource !== "budgets" && (
                <Field label="Name" full error={errors.name?.message}>
                  <input
                    {...register("name", {
                      required: "Enter a name.",
                      maxLength: {
                        value: 120,
                        message: "Use 120 characters or fewer.",
                      },
                    })}
                    placeholder={resource === "sources"
                      ? "e.g. Starlight Tech Inc."
                      : resource === "destinations"
                      ? "e.g. Metro Electric Utility"
                      : resource === "goals"
                      ? "e.g. Emergency fund"
                      : "Name this record"}
                  />
                </Field>
              )}
              {resource === "sources" && (
                <>
                  <Field label="Tax / withholding tag" full>
                    <input
                      {...register("taxTag", { maxLength: 80 })}
                      placeholder="e.g. W-2 payroll, 1099, gift"
                    />
                  </Field>
                  <label className="field full check-label">
                    <input type="checkbox" {...register("isRecurring")} />Recurring
                    income stream
                  </label>
                </>
              )}
              {resource === "destinations" && (
                <Field
                  label="Default expense category"
                  full
                  help="Suggested automatically when this vendor is selected."
                >
                  <select {...register("defaultCategoryId")}>
                    <SelectOptions
                      items={state.categories.filter((category) =>
                        category.type === "DEBIT"
                      )}
                      placeholder="No default category"
                    />
                  </select>
                </Field>
              )}
              {resource === "categories" && (
                <>
                  <Field label="Direction">
                    <select {...register("type")}>
                      {["DEBIT", "CREDIT", "TRANSFER"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Chart color">
                    <input type="color" {...register("colorCode")} />
                  </Field>
                  <label className="field full check-label">
                    <input type="checkbox" {...register("essential")} />Essential /
                    fixed expense category
                  </label>
                </>
              )}
              {resource === "accounts" && (
                <>
                  <Field label="Account type">
                    <select {...register("type")}>
                      {["CHECKING", "SAVINGS", "CREDIT_CARD", "CASH_WALLET"].map(
                        (value) => <option key={value}>{value}</option>,
                      )}
                    </select>
                  </Field>
                  <Field
                    label="Opening balance"
                    error={errors.openingBalance?.message}
                    help="Use a negative amount for debt. This becomes the ledger’s opening reserve."
                  >
                    <input
                      inputMode="decimal"
                      {...register("openingBalance", {
                        validate: (value) => {
                          try {
                            toCents(value);
                            return true;
                          } catch (error) {
                            return error.message;
                          }
                        },
                      })}
                    />
                  </Field>
                </>
              )}
              {resource === "budgets" && (
                <>
                  <Field
                    label="Expense category"
                    full
                    error={errors.categoryId?.message}
                  >
                    <select
                      {...register("categoryId", {
                        required: "Choose an expense category.",
                      })}
                    >
                      <SelectOptions
                        items={state.categories.filter((category) =>
                          category.type === "DEBIT"
                        )}
                      />
                    </select>
                  </Field>
                  <Field
                    label={`Monthly limit · ${
                      entry
                        ? `${entry.periodYear}-${
                          String(entry.periodMonth).padStart(2, "0")
                        }`
                        : month
                    }`}
                    full
                    error={errors.monthlyLimit?.message}
                  >
                    <input
                      inputMode="decimal"
                      {...register("monthlyLimit", { validate: positive })}
                    />
                    <input
                      type="range"
                      aria-label="Budget allocation slider"
                      min="25"
                      max="5000"
                      step="25"
                      value={Math.max(
                        25,
                        Math.min(5000, Number(watch("monthlyLimit")) || 25),
                      )}
                      onChange={(event) =>
                        setValue(
                          "monthlyLimit",
                          Number(event.target.value).toFixed(2),
                        )}
                    />
                  </Field>
                  <label className="field full check-label">
                    <input type="checkbox" {...register("rollover")} />Carry unspent
                    surplus into next month’s envelope
                  </label>
                </>
              )}
              {resource === "goals" && (
                <>
                  <Field label="Target amount" error={errors.targetAmount?.message}>
                    <input
                      inputMode="decimal"
                      {...register("targetAmount", { validate: positive })}
                    />
                  </Field>
                  <Field label="Target date (optional)">
                    <input type="date" {...register("deadline")} />
                  </Field>
                  <Field
                    label="Backing bank account"
                    full
                    error={errors.accountId?.message}
                    help="All allocations must fit inside this account’s actual balance."
                  >
                    <select
                      {...register("accountId", {
                        required: "Choose a backing account.",
                      })}
                    >
                      <SelectOptions items={state.accounts} />
                    </select>
                  </Field>
                </>
              )}
            </div>
          </div>
          <div className="modal-footer">
            {entry?.id && (
              <Button
                icon={Trash2}
                variant="danger"
                disabled={isSubmitting}
                onClick={() =>
                  setModal({
                    kind: "confirm",
                    title: "Remove this record?",
                    message:
                      "Referenced records cannot be removed. Release any goal allocation first.",
                    operations: [{
                      method: "DELETE",
                      endpoint: `/${resource}/${entry.id}`,
                      payload: {},
                    }],
                  })}
              >
                Delete
              </Button>
            )}
            <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
            <button type="submit" className="btn primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save record"}
            </button>
          </div>
        </form>
      );
    }
    function ConfirmForm({ modal, mutate, onClose }) {
      const [pending, setPending] = useState(false),
        [error, setError] = useState(""),
        [completed, setCompleted] = useState(0);
      const perform = async () => {
        setPending(true);
        setError("");
        let finished = completed;
        try {
          for (const operation of modal.operations.slice(completed)) {
            await mutate(
              operation.method,
              operation.endpoint,
              operation.payload,
              "",
              operation.key,
            );
            finished++;
            setCompleted(finished);
          }
          onClose();
        } catch (error) {
          setError(
            `${finished} of ${modal.operations.length} operation(s) completed. ${error.message}`,
          );
        } finally {
          setPending(false);
        }
      };
      return (
        <>
          <div className="modal-body">
            <p className="muted">{modal.message}</p>
            {error && <div className="inline-error mt">{error}</div>}
          </div>
          <div className="modal-footer">
            <Button onClick={onClose} disabled={pending}>Cancel</Button>
            <Button variant="primary" onClick={perform} disabled={pending}>
              {pending ? "Applying…" : completed ? "Retry remaining" : "Confirm"}
            </Button>
          </div>
        </>
      );
    }
    function SmallActionForm({ modal, state, money, mutate, onClose, month }) {
      const defaults = modal.kind === "merge"
        ? { fromId: "", toId: "" }
        : modal.kind === "contribute"
        ? { amount: "100.00" }
        : modal.kind === "settle"
        ? { amount: modal.transfer.amount, notes: "" }
        : modal.kind === "member"
        ? {
          email: modal.entry?.user.email || "",
          role: modal.entry?.role || "MEMBER",
        }
        : { goalId: "" };
      const { register, handleSubmit, formState: { errors, isSubmitting } } =
        useForm({ defaultValues: defaults });
      const [error, setError] = useState("");
      const submit = async (values) => {
        setError("");
        try {
          if (modal.kind === "merge") {
            await mutate(
              "POST",
              "/destinations/merge",
              values,
              "Vendor references merged across ledger and schedules.",
            );
          }
          if (modal.kind === "contribute") {
            await mutate("POST", `/goals/${modal.goal.id}/contribute`, {
              amount: values.amount,
            }, "Virtual jar allocation updated. Bank balance is unchanged.");
          }
          if (modal.kind === "settle") {
            await mutate("POST", "/settlements", {
              ...modal.transfer,
              amount: values.amount,
              notes: values.notes,
            }, "Settlement confirmed. Household bank balances are unchanged.");
          }
          if (modal.kind === "member") {
            await mutate(
              modal.entry ? "PATCH" : "POST",
              `/members${modal.entry ? `/${modal.entry.id}` : ""}`,
              modal.entry ? { role: values.role } : values,
              "Household membership updated.",
            );
          }
          if (modal.kind === "rollover") {
            await mutate(
              "POST",
              "/budgets/rollover",
              {
                periodMonth: Number(month.slice(5)),
                periodYear: Number(month.slice(0, 4)),
                ...(values.goalId ? { goalId: values.goalId } : {}),
              },
              "Next month’s envelopes created. Existing envelopes are not overwritten.",
            );
          }
          onClose();
        } catch (error) {
          setError(error.message);
        }
      };
      return (
        <form onSubmit={handleSubmit(submit)}>
          <div className="modal-body stack">
            {error && <div className="inline-error" role="alert">{error}</div>}
            {modal.kind === "merge" && (
              <>
                <p className="muted">
                  All ledger and recurring references move from the duplicate vendor
                  to the canonical destination. The duplicate is then removed.
                </p>
                <Field
                  label="Duplicate vendor to merge"
                  error={errors.fromId?.message}
                >
                  <select
                    {...register("fromId", { required: "Choose a duplicate." })}
                  >
                    <SelectOptions items={state.destinations} />
                  </select>
                </Field>
                <Field
                  label="Keep this canonical vendor"
                  error={errors.toId?.message}
                >
                  <select
                    {...register("toId", {
                      required: "Choose the canonical vendor.",
                    })}
                  >
                    <SelectOptions items={state.destinations} />
                  </select>
                </Field>
              </>
            )}
            {modal.kind === "contribute" && (
              <>
                <div className="notice">
                  <span>
                    <strong>{modal.goal.name}</strong>
                    <br />Currently allocated:{" "}
                    {money(toCents(modal.goal.currentAmount))}
                    <br />Backed by{" "}
                    {lookup(state.accounts, modal.goal.accountId)?.name}
                  </span>
                </div>
                <Field
                  label="Allocation change"
                  help="Positive to reserve funds; negative to release them. This does not move money between accounts."
                  error={errors.amount?.message}
                >
                  <input
                    inputMode="decimal"
                    {...register("amount", {
                      validate: (value) => {
                        try {
                          return toCents(value) !== 0 ||
                            "Enter a nonzero allocation change.";
                        } catch (error) {
                          return error.message;
                        }
                      },
                    })}
                  />
                </Field>
              </>
            )}
            {modal.kind === "settle" && (
              <>
                <p>
                  {fullName(lookup(state.members, modal.transfer.fromMemberId))}
                  {" "}
                  pays {fullName(lookup(state.members, modal.transfer.toMemberId))}.
                </p>
                <Field label="Amount already paid" error={errors.amount?.message}>
                  <input
                    inputMode="decimal"
                    {...register("amount", {
                      validate: (value) =>
                        positiveAmountSchema.safeParse(value).success ||
                        "Enter a positive payment amount.",
                    })}
                  />
                </Field>
                <Field
                  label="Receipt / payment confirmation reference"
                  help="Record your bank transfer or cash receipt reference. No payment is initiated by this app."
                >
                  <input
                    {...register("notes", {
                      required: "Enter a payment confirmation reference.",
                      maxLength: 300,
                    })}
                    placeholder="e.g. Bank transfer reference 4829"
                  />
                </Field>
                {errors.notes && (
                  <span className="red">{errors.notes.message}</span>
                )}
              </>
            )}
            {modal.kind === "member" && (
              <>
                {!modal.entry && (
                  <Field
                    label="Registered member’s email"
                    help="On the server, this person must register first. Demo mode adds a local sample member."
                    error={errors.email?.message}
                  >
                    <input
                      type="email"
                      {...register("email", { required: "Enter an email." })}
                    />
                  </Field>
                )}
                <Field label="Household role">
                  <select {...register("role")}>
                    <option value="ADMIN">
                      Admin — all records and configuration
                    </option>
                    <option value="MEMBER">
                      Contributor — own entries and shared resources
                    </option>
                    <option value="VIEWER">
                      Viewer — read-only household visibility
                    </option>
                  </select>
                </Field>
              </>
            )}
            {modal.kind === "rollover" && (
              <>
                <p className="muted">
                  Create next month’s caps from{" "}
                  {month}. Rollover-enabled envelopes add unspent surplus; others
                  keep their base cap. Running again does not duplicate or overwrite
                  existing next-month caps.
                </p>
                <Field
                  label="Optional savings goal for non-rollover surplus"
                  help="Only unallocated cash in the goal’s backing account can be reserved; planning surplus does not create new money."
                >
                  <select {...register("goalId")}>
                    <SelectOptions
                      items={state.goals}
                      placeholder="Do not reserve surplus in a goal"
                    />
                  </select>
                </Field>
              </>
            )}
          </div>
          <div className="modal-footer">
            <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
            <button type="submit" className="btn primary" disabled={isSubmitting}>
              {isSubmitting
                ? "Saving…"
                : modal.kind === "settle"
                ? "Confirm payment received"
                : "Confirm changes"}
            </button>
          </div>
        </form>
      );
    }
    function ReconcileForm({ state, modal, money, mutate, onClose }) {
      const { account } = modal;
      const [step, setStep] = useState(1),
        [statement, setStatement] = useState(account.currentBalance),
        [notes, setNotes] = useState("Statement reconciliation"),
        [reviewed, setReviewed] = useState(false),
        [error, setError] = useState(""),
        [pending, setPending] = useState(false);
      let difference = 0;
      try {
        difference = toCents(statement) - toCents(account.currentBalance);
      } catch {}
      const relevant = state.transactions.filter((transaction) =>
        (transaction.fromAccountId === account.id ||
          transaction.toAccountId === account.id) &&
        (!account.lastReconciledAt ||
          transaction.createdAt &&
            transaction.createdAt > account.lastReconciledAt ||
          transaction.transactedAt > account.lastReconciledAt)
      );
      const next = () => {
        try {
          toCents(statement);
          setError("");
          setStep(2);
        } catch (error) {
          setError(error.message);
        }
      };
      const confirm = async () => {
        setPending(true);
        try {
          await mutate(
            "POST",
            `/accounts/${account.id}/reconcile`,
            {
              statementBalance: statement,
              expectedBalance: account.currentBalance,
              notes,
            },
            "Account reconciled. Any difference is recorded as an auditable adjustment.",
          );
          onClose();
        } catch (error) {
          setError(error.message);
        } finally {
          setPending(false);
        }
      };
      return (
        <>
          <div className="modal-body stack">
            <div className="tabs">
              <button
                type="button"
                className={step === 1 ? "active" : ""}
                onClick={() => setStep(1)}
              >
                1. Statement
              </button>
              <button
                type="button"
                className={step === 2 ? "active" : ""}
                onClick={next}
              >
                2. Review ledger
              </button>
              <button
                type="button"
                className={step === 3 ? "active" : ""}
                disabled={!reviewed}
                onClick={() => setStep(3)}
              >
                3. Confirm
              </button>
            </div>
            {error && <div className="inline-error">{error}</div>}
            <div className="between">
              <strong>{account.name}</strong>
              <span className="money">
                Ledger: {money(toCents(account.currentBalance))}
              </span>
            </div>
            {step === 1 && (
              <>
                <Field
                  label="Actual ending statement balance"
                  help="Negative values represent liabilities, such as credit-card debt."
                >
                  <input
                    className="amount-input"
                    inputMode="decimal"
                    value={statement}
                    onChange={(event) => setStatement(event.target.value)}
                  />
                </Field>
                <Field label="Reconciliation note">
                  <textarea
                    value={notes}
                    maxLength={3000}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </Field>
              </>
            )}
            {step === 2 && (
              <>
                <p className="muted">
                  Review entries recorded since the last reconciliation. This is
                  manual statement comparison, not an automated bank match.
                </p>
                <div className="table-scroll" style={{ maxHeight: 260 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Notes</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relevant.map((transaction) => (
                        <tr key={transaction.id}>
                          <td>{dateLabel(transaction.transactedAt)}</td>
                          <td>{transaction.notes || transaction.type}</td>
                          <td className="money">
                            {money(toCents(transaction.amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!relevant.length && (
                  <p className="muted">No entries since the last reconciliation.</p>
                )}
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(event) => setReviewed(event.target.checked)}
                  />I reviewed the statement against these ledger entries.
                </label>
              </>
            )}
            {step === 3 && (
              <>
                <div className={`notice ${difference ? "warning" : ""}`}>
                  <span>
                    Statement balance:{" "}
                    <b className="money">{money(toCents(statement))}</b>
                    <br />Adjustment to post:{" "}
                    <b className="money">{money(difference)}</b>
                  </span>
                </div>
                <p className="muted">
                  {difference
                    ? "A signed ADJUSTMENT entry will reconcile this account. It is excluded from income, spending, budgets, and split liabilities."
                    : "The account matches. Only its reconciliation timestamp will change."}
                </p>
              </>
            )}
          </div>
          <div className="modal-footer">
            <Button onClick={onClose} disabled={pending}>Cancel</Button>
            {step === 1
              ? <Button variant="primary" onClick={next}>Review ledger</Button>
              : step === 2
              ? (
                <Button
                  variant="primary"
                  disabled={!reviewed}
                  onClick={() => setStep(3)}
                >
                  Continue
                </Button>
              )
              : (
                <Button variant="primary" disabled={pending} onClick={confirm}>
                  {pending ? "Reconciling…" : "Confirm reconciliation"}
                </Button>
              )}
          </div>
        </>
      );
    }
    function ImportForm({ state, money, mutate, onClose }) {
      const [text, setText] = useState(""),
        [rows, setRows] = useState([]),
        [error, setError] = useState(""),
        [pending, setPending] = useState(false),
        submissionKey = useRef(uid());
      const preview = () => {
        try {
          setRows(importRows(text, state));
          setError("");
        } catch (error) {
          setError(error.message);
          setRows([]);
        }
      };
      const submit = async () => {
        setPending(true);
        try {
          await mutate(
            "POST",
            "/transactions/import",
            { items: rows },
            `${rows.length} transactions imported atomically.`,
            submissionKey.current,
          );
          onClose();
        } catch (error) {
          setError(error.message);
        } finally {
          setPending(false);
        }
      };
      return (
        <>
          <div className="modal-body stack">
            <p className="muted">
              Import the ledger’s CSV format. Categories, accounts, sources,
              vendors, and members must already exist. Imports create new entries;
              export files are not a deduplication backup. Split and adjustment
              records cannot be imported.
            </p>
            {error && <div className="inline-error">{error}</div>}
            <Field label="CSV file (up to 1 MB)">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 1000000) {
                    setError("CSV must be under 1 MB.");
                    return;
                  }
                  setText(await file.text());
                  setRows([]);
                }}
              />
            </Field>
            <Field label="Or paste CSV content">
              <textarea
                style={{
                  minHeight: 140,
                  fontFamily: "JetBrains Mono",
                  fontSize: 10,
                }}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setRows([]);
                }}
                placeholder="date,type,amount,category,entity,fromAccount,toAccount,member,allocation,notes"
              />
            </Field>
            <Button onClick={preview} disabled={!text || pending}>
              Validate & preview
            </Button>
            {rows.length > 0 && (
              <>
                <div className="notice">
                  <span>
                    {rows.length} valid rows · credits{" "}
                    {money(sumMoney(rows.filter((row) => row.type === "CREDIT")))}
                    {" "}
                    · debits{" "}
                    {money(sumMoney(rows.filter((row) => row.type === "DEBIT")))}
                  </span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 8).map((row, index) => (
                        <tr key={index}>
                          <td>{String(row.transactedAt).slice(0, 10)}</td>
                          <td>{row.type}</td>
                          <td className="money">{money(toCents(row.amount))}</td>
                          <td>{row.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          <div className="modal-footer">
            <Button onClick={onClose} disabled={pending}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!rows.length || pending}
              onClick={submit}
            >
              {pending ? "Importing…" : `Import ${rows.length} entries`}
            </Button>
          </div>
        </>
      );
    }
    function SettingsView(
      {
        state,
        mode,
        theme,
        setTheme,
        setModal,
        isAdmin,
        connect,
        logout,
        notify,
        query,
        onClose,
      },
    ) {
      const [audit, setAudit] = useState(null), [error, setError] = useState("");
      const loadAudit = async () => {
        try {
          setAudit(
            mode === "demo"
              ? state.auditLogs.slice(-200).reverse()
              : await api("/audit"),
          );
        } catch (error) {
          setError(error.message);
        }
      };
      return (
        <div className="modal-body stack">
          <div className="between">
            <div>
              <h3>{state.household.name}</h3>
              <p className="subtitle">
                {state.household.currency} · {mode === "demo"
                  ? "Local browser demo"
                  : "Authenticated MySQL workspace"}
              </p>
            </div>
            <span className="pill green">
              <Icon icon={ShieldCheck} size={12} />
              {lookup(state.members, state.currentMemberId)?.role}
            </span>
          </div>
          <div className="between">
            <span>Appearance</span>
            <div className="tabs">
              <button
                className={theme === "light" ? "active" : ""}
                onClick={() => setTheme("light")}
              >
                Light
              </button>
              <button
                className={theme === "dark" ? "active" : ""}
                onClick={() => setTheme("dark")}
              >
                Dark
              </button>
            </div>
          </div>
          <div className="notice">
            <span>
              Keyboard shortcuts: <b>N</b> quick entry · <b>⌘/Ctrl K</b> search ·
              {" "}
              <b>Escape</b> close dialog.
            </span>
          </div>
          <div className="between">
            <h3>Category directory</h3>
            <Button
              icon={Plus}
              disabled={!isAdmin}
              onClick={() => setModal({ kind: "resource", resource: "categories" })}
            >
              Add category
            </Button>
          </div>
          <div
            className="list"
            style={{
              maxHeight: 225,
              overflow: "auto",
              border: "1px solid var(--border)",
              borderRadius: 7,
            }}
          >
            {state.categories.map((category) => (
              <div
                className="list-row"
                key={category.id}
                style={{ padding: "10px 12px" }}
              >
                <div className="flex gap6">
                  <span
                    className="dot"
                    style={{ background: category.colorCode }}
                  />
                  <span>{category.name}</span>
                  <span className="pill">{category.type}</span>
                </div>
                {category.type !== "ADJUSTMENT" && (
                  <button
                    className="icon-btn"
                    aria-label={`Edit ${category.name}`}
                    disabled={!isAdmin}
                    onClick={() =>
                      setModal({
                        kind: "resource",
                        resource: "categories",
                        entry: category,
                      })}
                  >
                    <Icon icon={Pencil} size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {isAdmin && (
            <>
              <div className="between">
                <h3>Audit trail</h3>
                <Button icon={FileText} onClick={loadAudit}>
                  Load latest 200 events
                </Button>
              </div>
              {audit && (
                <div className="list" style={{ maxHeight: 200, overflow: "auto" }}>
                  {audit.map((event) => (
                    <div className="list-row" key={event.id}>
                      <div>
                        <strong style={{ fontSize: 11 }}>{event.action}</strong>
                        <div className="muted">
                          {dateLabel(event.createdAt)} ·{" "}
                          {event.entityId || event.detail?.entityId}
                        </div>
                      </div>
                    </div>
                  ))}
                  {!audit.length && <span className="muted">No events yet.</span>}
                </div>
              )}
            </>
          )}
          {error && <div className="inline-error">{error}</div>}
          <div className="divider" />
          {mode === "demo"
            ? (
              <>
                <Button
                  icon={LockKeyhole}
                  variant="primary"
                  onClick={() => {
                    onClose();
                    connect();
                  }}
                >
                  Connect to the real server
                </Button>
                <Button
                  icon={RefreshCw}
                  variant="danger"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Reset all local demo changes? This does not affect any server data.",
                      )
                    ) {
                      try {
                        localStorage.setItem(STORAGE, JSON.stringify(seedDemo()));
                        query.refetch();
                        onClose();
                        notify("Demo workspace reset.");
                      } catch (error) {
                        setError(error.message);
                      }
                    }
                  }}
                >
                  Reset local demo
                </Button>
                <p className="footnote">
                  Demo records are unencrypted browser storage. Do not put sensitive
                  real receipts or financial data into demo mode.
                </p>
              </>
            )
            : <Button icon={LogOut} onClick={logout}>Sign out</Button>}
          <p className="footnote">
            First-use checklist: add accounts → income sources and vendors → log
            transactions → set budgets and goals. The server never receives demo
            records automatically.
          </p>
        </div>
      );
    }
    function ReportView({ modal, state, money }) {
      const totals = {
        CREDIT: sumMoney(modal.entries.filter((entry) => entry.type === "CREDIT")),
        DEBIT: sumMoney(modal.entries.filter((entry) => entry.type === "DEBIT")),
        ADJUSTMENT: sumMoney(
          modal.entries.filter((entry) => entry.type === "ADJUSTMENT"),
        ),
      };
      const report = useRef(null), [error, setError] = useState("");
      const printReport = () => {
        const popup = window.open("", "_blank", "width=1000,height=800");
        if (!popup) {
          setError("Allow popups to open the print-ready report.");
          return;
        }
        const documentBody = popup.document;
        documentBody.open();
        documentBody.write(
          "<!doctype html><html><head><title>Household financial report</title><style>body{font:14px system-ui;padding:35px;color:#172b35}h1{font-size:24px}table{width:100%;border-collapse:collapse;font-size:11px;margin-top:25px}td,th{padding:9px;border-bottom:1px solid #ddd;text-align:left}small{color:#777}.summary{display:flex;gap:35px;margin:25px 0}.money{font-family:monospace}@media print{body{padding:0}tr{break-inside:avoid}}</style></head><body></body></html>",
        );
        documentBody.close();
        documentBody.body.appendChild(report.current.cloneNode(true));
        popup.focus();
        setTimeout(() => popup.print(), 350);
      };
      return (
        <>
          <div className="modal-body">
            <div ref={report}>
              <h1>{modal.title}</h1>
              <p className="muted">
                {state.household.name} · {state.household.currency} · Generated{" "}
                {todayISO()}
              </p>
              <div className="summary flex wrap mt">
                <div>
                  Income <strong className="money">{money(totals.CREDIT)}</strong>
                </div>
                <div>
                  Expenses <strong className="money">{money(totals.DEBIT)}</strong>
                </div>
                <div>
                  Net flow{" "}
                  <strong className="money">
                    {money(totals.CREDIT - totals.DEBIT)}
                  </strong>
                </div>
                <div>
                  Adjustments{" "}
                  <strong className="money">{money(totals.ADJUSTMENT)}</strong>
                </div>
              </div>
              <div className="table-scroll mt">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Direction</th>
                      <th>Source / destination</th>
                      <th>Category</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modal.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td>{dateLabel(entry.transactedAt)}</td>
                        <td>{entry.type}</td>
                        <td>
                          {lookup(
                            entry.type === "CREDIT"
                              ? state.sources
                              : state.destinations,
                            entry.sourceId || entry.destinationId,
                          )?.name || entry.type}
                        </td>
                        <td>{lookup(state.categories, entry.categoryId)?.name}</td>
                        <td className="money">{money(toCents(entry.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="footnote mt">
                Internal transfers are excluded from income and spending. Goal jars
                are already included in account balances. Demo reports contain
                sample data.
              </p>
            </div>
            {error && <div className="inline-error">{error}</div>}
          </div>
          <div className="modal-footer">
            <Button
              icon={Download}
              onClick={() => exportCSV(modal.entries, state, "quarter-report.csv")}
            >
              CSV
            </Button>
            <Button icon={FileText} variant="primary" onClick={printReport}>
              Print / Save as PDF
            </Button>
          </div>
        </>
      );
    }
    function AppModal(props) {
      const {
        modal,
        onClose,
        state,
        money,
        budgets,
        categorySpent,
        setModal,
        navigate,
      } = props;
      const titles = {
        transaction: modal.entry?.id ? "Edit transaction" : "Quick add transaction",
        schedule: modal.entry
          ? "Edit recurring schedule"
          : "New recurring schedule",
        resource: `${modal.entry ? "Edit" : "New"} ${
          ({
            sources: "income source",
            destinations: "vendor destination",
            categories: "category",
            accounts: "account",
            budgets: "budget envelope",
            goals: "savings goal",
          })[modal.resource]
        }`,
        receipt: "Transaction receipt",
        settings: "Workspace settings",
        alerts: "Household notifications",
        import: "Import transaction CSV",
        merge: "Merge duplicate destinations",
        contribute: "Allocate or release goal funds",
        settle: "Confirm member settlement",
        member: modal.entry
          ? "Manage member permissions"
          : "Add registered household member",
        rollover: "Month-end budget rollover",
        reconcile: "Reconcile account",
        report: modal.title,
        confirm: modal.title,
      };
      const overdue = state.recurring.filter((rule) =>
        rule.active && String(rule.nextDueDate).slice(0, 10) < todayISO()
      );
      const over = budgets.filter((budget) =>
        categorySpent(budget.categoryId) > toCents(budget.monthlyLimit)
      );
      return (
        <Modal
          title={titles[modal.kind] || "Household"}
          onClose={onClose}
          wide={["report", "import", "reconcile"].includes(modal.kind)}
        >
          {modal.kind === "transaction" && (
            <TransactionForm
              {...props}
              key={modal.entry?.id || modal.type || "new"}
            />
          )}
          {modal.kind === "schedule" && (
            <TransactionForm
              {...props}
              schedule
              key={modal.entry?.id || modal.type || "schedule"}
            />
          )}
          {modal.kind === "resource" && <ResourceForm {...props} />}
          {modal.kind === "confirm" && <ConfirmForm {...props} />}
          {["merge", "contribute", "settle", "member", "rollover"].includes(
            modal.kind,
          ) && <SmallActionForm {...props} />}
          {modal.kind === "reconcile" && <ReconcileForm {...props} />}
          {modal.kind === "import" && <ImportForm {...props} />}
          {modal.kind === "settings" && <SettingsView {...props} />}
          {modal.kind === "report" && <ReportView {...props} />}
          {modal.kind === "receipt" && (
            <div className="modal-body">
              <img
                className="receipt-preview"
                src={modal.entry.receiptUrl}
                alt={`Receipt for ${modal.entry.notes || modal.entry.type}`}
                referrerPolicy="no-referrer"
              />
              <p className="subtitle mt">
                {dateLabel(modal.entry.transactedAt)} ·{" "}
                {money(toCents(modal.entry.amount))}
              </p>
            </div>
          )}
          {modal.kind === "alerts" && (
            <div className="modal-body stack">
              {over.map((budget) => (
                <div className="notice warning" key={budget.id}>
                  <span>
                    {lookup(state.categories, budget.categoryId)?.name}:{" "}
                    <b>
                      {money(
                        categorySpent(budget.categoryId) -
                          toCents(budget.monthlyLimit),
                      )}
                    </b>{" "}
                    above your envelope.
                  </span>
                  <Button
                    onClick={() => {
                      onClose();
                      navigate("budgets");
                    }}
                  >
                    Review
                  </Button>
                </div>
              ))}
              {overdue.map((rule) => (
                <div className="notice warning" key={rule.id}>
                  <span>{rule.title} was due {dateLabel(rule.nextDueDate)}.</span>
                  <Button
                    onClick={() => setModal({ kind: "schedule", entry: rule })}
                  >
                    Review
                  </Button>
                </div>
              ))}
              {!over.length && !overdue.length && (
                <Empty
                  title="All caught up"
                  message="No overdue schedules or over-budget envelopes for this view."
                />
              )}
              <p className="footnote">
                Budget alerts follow the selected reporting month. Overdue schedule
                reminders follow today’s date.
              </p>
            </div>
          )}
        </Modal>
      );
    }
    function AuthForm({ onSuccess, onDemo, notify }) {
      const [tab, setTab] = useState("login"), [error, setError] = useState("");
      const { register, handleSubmit, formState: { errors, isSubmitting } } =
        useForm({ defaultValues: { currency: "USD" }, shouldUnregister: true });
      const submit = async (values) => {
        setError("");
        const fields = tab === "register"
          ? [
            "email",
            "password",
            "firstName",
            "lastName",
            "householdName",
            "currency",
          ]
          : ["email", "password"];
        const payload = Object.fromEntries(
          fields.map((field) => [field, values[field]]),
        );
        try {
          const result = await api(`/auth/${tab}`, {
            method: "POST",
            body: payload,
          });
          onSuccess(result);
        } catch (error) {
          setError(
            error.message ||
              "Connection failed. Run the Express backend and open its URL.",
          );
        }
      };
      return (
        <form onSubmit={handleSubmit(submit)}>
          <div className="modal-body">
            <div className="auth-brand">
              <span className="brand-mark">
                <Icon icon={House} size={23} />
              </span>household.
            </div>
            <h2>Your money, together.</h2>
            <p className="subtitle" style={{ marginBottom: 20 }}>
              A secure home for your household’s financial life.
            </p>
            <div className="tabs">
              <button
                type="button"
                className={tab === "login" ? "active" : ""}
                onClick={() => {
                  setTab("login");
                  setError("");
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                className={tab === "register" ? "active" : ""}
                onClick={() => {
                  setTab("register");
                  setError("");
                }}
              >
                Register household
              </button>
            </div>
            {error && <div className="inline-error" role="alert">{error}</div>}
            <div className="form-grid">
              {tab === "register" && (
                <>
                  <Field label="First name" error={errors.firstName?.message}>
                    <input
                      autoComplete="given-name"
                      {...register("firstName", {
                        required: "Enter your first name.",
                        maxLength: 120,
                      })}
                    />
                  </Field>
                  <Field label="Last name" error={errors.lastName?.message}>
                    <input
                      autoComplete="family-name"
                      {...register("lastName", {
                        required: "Enter your last name.",
                        maxLength: 120,
                      })}
                    />
                  </Field>
                  <Field
                    label="Household name"
                    full
                    error={errors.householdName?.message}
                  >
                    <input
                      {...register("householdName", {
                        required: "Name your household.",
                        maxLength: 120,
                      })}
                      placeholder="Morgan household"
                    />
                  </Field>
                </>
              )}
              <Field label="Email" full error={errors.email?.message}>
                <input
                  type="email"
                  autoComplete="email"
                  {...register("email", { required: "Enter your email." })}
                />
              </Field>
              <Field
                label="Password"
                full
                error={errors.password?.message}
                help="12–72 characters, at most 72 UTF-8 bytes. Your password is hashed on the server."
              >
                <input
                  type="password"
                  autoComplete={tab === "login"
                    ? "current-password"
                    : "new-password"}
                  {...register("password", {
                    required: "Enter your password.",
                    minLength: {
                      value: 12,
                      message: "Use at least 12 characters.",
                    },
                    maxLength: { value: 72, message: "Use at most 72 characters." },
                  })}
                />
              </Field>
              {tab === "register" && (
                <Field label="Household currency" full>
                  <select {...register("currency")}>
                    {["USD", "EUR", "GBP", "CAD", "AUD", "INR"].map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <p className="footnote mt">
              Connects only to the same-origin Express API. No demo passwords,
              database credentials, or auth tokens are saved in browser storage.
            </p>
          </div>
          <div className="modal-footer">
            <Button onClick={onDemo} disabled={isSubmitting}>Use local demo</Button>
            <button type="submit" className="btn primary" disabled={isSubmitting}>
              <Icon icon={LockKeyhole} size={14} />
              {isSubmitting
                ? "Connecting…"
                : tab === "register"
                ? "Create household"
                : "Sign in"}
            </button>
          </div>
        </form>
      );
    }
    function AuthScreen(props) {
      return (
        <div className="auth-background">
          <div className="modal">
            <AuthForm {...props} />
          </div>
        </div>
      );
    }
    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      render() {
        return this.state.error
          ? (
            <div className="loading">
              <h2>Something interrupted the workspace.</h2>
              <p>{this.state.error.message}</p>
              <p>Your saved data has not been reset.</p>
              <Button onClick={() => location.reload()}>Reload workspace</Button>
            </div>
          )
          : this.props.children;
      }
    }
    createRoot(document.getElementById("root")).render(
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ErrorBoundary>,
    );