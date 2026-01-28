/**
 * CSV Worker Pool Browser Tests
 *
 * Comprehensive tests for the CSV Web Worker implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CsvWorkerPool,
  CsvWorkerSession,
  hasWorkerSupport,
  parseWithPool,
  formatWithPool,
  getDefaultWorkerPool,
  terminateDefaultWorkerPool
} from "@csv/worker/index.browser";

describe("CSV Worker Pool - Browser", () => {
  // ===========================================================================
  // Environment Tests
  // ===========================================================================

  describe("hasWorkerSupport", () => {
    it("should return true in browser environment", () => {
      expect(hasWorkerSupport()).toBe(true);
    });
  });

  // ===========================================================================
  // CsvWorkerPool Basic Tests
  // ===========================================================================

  describe("CsvWorkerPool", () => {
    let pool: CsvWorkerPool;

    beforeEach(() => {
      pool = new CsvWorkerPool({ maxWorkers: 2 });
    });

    afterEach(() => {
      pool.terminate();
    });

    describe("constructor options", () => {
      it("should create minWorkers on initialization", () => {
        const poolWithMin = new CsvWorkerPool({ minWorkers: 2, maxWorkers: 4 });
        const stats = poolWithMin.getStats();
        expect(stats.totalWorkers).toBe(2);
        poolWithMin.terminate();
      });
    });

    describe("parse", () => {
      it("should parse simple CSV", async () => {
        const result = await pool.parse("a,b,c\n1,2,3\n4,5,6");
        expect(result.data).toEqual([
          ["a", "b", "c"],
          ["1", "2", "3"],
          ["4", "5", "6"]
        ]);
        expect(result.duration).toBeGreaterThanOrEqual(0);
      });

      it("should parse with headers option", async () => {
        const result = await pool.parse("name,age\nAlice,30\nBob,25", { headers: true });
        expect(result.data).toEqual({
          headers: ["name", "age"],
          rows: [
            { name: "Alice", age: "30" },
            { name: "Bob", age: "25" }
          ]
        });
      });

      it("should parse with custom delimiter", async () => {
        const result = await pool.parse("a;b;c\n1;2;3", { delimiter: ";" });
        expect(result.data).toEqual([
          ["a", "b", "c"],
          ["1", "2", "3"]
        ]);
      });

      it("should handle quoted fields", async () => {
        const result = await pool.parse('name,value\n"Hello, World",42');
        expect(result.data).toEqual([
          ["name", "value"],
          ["Hello, World", "42"]
        ]);
      });

      it("should handle escaped quotes", async () => {
        const result = await pool.parse('a\n"He said ""Hello"""');
        expect(result.data).toEqual([["a"], ['He said "Hello"']]);
      });

      it("should handle multiline quoted fields", async () => {
        const result = await pool.parse('text\n"Line 1\nLine 2"');
        expect(result.data).toEqual([["text"], ["Line 1\nLine 2"]]);
      });

      it("should skip empty lines", async () => {
        const result = await pool.parse("a\n\nb\n\nc", { skipEmptyLines: true });
        expect(result.data).toEqual([["a"], ["b"], ["c"]]);
      });

      it("should trim fields", async () => {
        const result = await pool.parse(" a , b \n 1 , 2 ", { trim: true });
        expect(result.data).toEqual([
          ["a", "b"],
          ["1", "2"]
        ]);
      });

      it("should limit rows with maxRows", async () => {
        const result = await pool.parse("a\n1\n2\n3\n4\n5", { maxRows: 3 });
        expect(result.data).toHaveLength(3);
      });

      it("should parse in fast mode", async () => {
        const result = await pool.parse("a,b,c\n1,2,3\n4,5,6", { fastMode: true });
        expect(result.data).toEqual([
          ["a", "b", "c"],
          ["1", "2", "3"],
          ["4", "5", "6"]
        ]);
      });
    });

    describe("format", () => {
      it("should format simple data", async () => {
        const result = await pool.format([
          ["a", "b", "c"],
          [1, 2, 3]
        ]);
        expect(result.data).toBe("a,b,c\n1,2,3");
      });

      it("should format with custom delimiter", async () => {
        const result = await pool.format(
          [
            ["a", "b"],
            [1, 2]
          ],
          { delimiter: ";" }
        );
        expect(result.data).toBe("a;b\n1;2");
      });

      it("should quote fields with special characters", async () => {
        const result = await pool.format([["Hello, World", "normal"]]);
        expect(result.data).toBe('"Hello, World",normal');
      });

      it("should escape quotes in fields", async () => {
        const result = await pool.format([['He said "Hello"']]);
        expect(result.data).toBe('"He said ""Hello"""');
      });

      it("should escape formulae", async () => {
        const result = await pool.format([["=SUM(A1)", "+1", "-1", "@mention"]], {
          escapeFormulae: true
        });
        expect(result.data).toBe('"\t=SUM(A1)","\t+1","\t-1","\t@mention"');
      });

      it("should use alwaysQuote option", async () => {
        const result = await pool.format([["a", "b"]], { alwaysQuote: true });
        expect(result.data).toBe('"a","b"');
      });
    });

    describe("getStats", () => {
      it("should return statistics", async () => {
        const stats = pool.getStats();
        expect(stats).toHaveProperty("totalWorkers");
        expect(stats).toHaveProperty("busyWorkers");
        expect(stats).toHaveProperty("pendingTasks");
        expect(stats).toHaveProperty("completedTasks");
        expect(stats).toHaveProperty("failedTasks");
        // idleWorkers can be computed: totalWorkers - busyWorkers
        expect(stats.totalWorkers - stats.busyWorkers).toBeGreaterThanOrEqual(0);
      });

      it("should track completed tasks", async () => {
        await pool.parse("a,b\n1,2");
        await pool.format([["x", "y"]]);
        const stats = pool.getStats();
        expect(stats.completedTasks).toBe(2);
      });
    });

    describe("terminate", () => {
      it("should terminate all workers", () => {
        pool.terminate();
        const stats = pool.getStats();
        expect(stats.totalWorkers).toBe(0);
      });

      it("should reject new tasks after termination", async () => {
        pool.terminate();
        await expect(pool.parse("a,b")).rejects.toThrow("terminated");
      });

      it("should be idempotent", () => {
        pool.terminate();
        pool.terminate();
        pool.terminate();
        expect(pool.getStats().totalWorkers).toBe(0);
      });
    });
  });

  // ===========================================================================
  // CsvWorkerSession Tests
  // ===========================================================================

  describe("CsvWorkerSession", () => {
    let session: CsvWorkerSession;

    beforeEach(() => {
      session = new CsvWorkerSession();
    });

    afterEach(async () => {
      await session.dispose();
      terminateDefaultWorkerPool();
    });

    describe("properties", () => {
      it("should have unique sessionId", () => {
        const session2 = new CsvWorkerSession();
        expect(session.sessionId).toBeTruthy();
        expect(session2.sessionId).toBeTruthy();
        expect(session.sessionId).not.toBe(session2.sessionId);
        session2.dispose();
      });

      it("should update headers and rowCount after load", async () => {
        expect(session.headers).toEqual([]);
        expect(session.rowCount).toBe(0);

        await session.load("name,age\nAlice,30\nBob,25", { headers: true });

        expect(session.headers).toEqual(["name", "age"]);
        expect(session.rowCount).toBe(2);
      });
    });

    describe("load", () => {
      it("should load CSV string", async () => {
        const result = await session.load("name,age\nAlice,30\nBob,25", { headers: true });
        expect(result.rowCount).toBe(2);
        expect(result.headers).toEqual(["name", "age"]);
      });

      it("should load array of objects", async () => {
        const data = [
          { name: "Alice", age: 30 },
          { name: "Bob", age: 25 }
        ];
        const result = await session.load(data);
        expect(result.rowCount).toBe(2);
        expect(result.headers).toContain("name");
        expect(result.headers).toContain("age");
      });

      it("should load 2D array with headers", async () => {
        const data = [
          ["Alice", 30],
          ["Bob", 25]
        ];
        const result = await session.load(data, { headers: ["name", "age"] });
        expect(result.rowCount).toBe(2);
        expect(result.headers).toEqual(["name", "age"]);
      });
    });

    describe("sort", () => {
      beforeEach(async () => {
        await session.load("name,age\nCharlie,35\nAlice,30\nBob,25", { headers: true });
      });

      it("should sort by string column ascending", async () => {
        await session.sort({ column: "name", order: "asc" });
        const { data } = await session.getData();
        expect(data[0].name).toBe("Alice");
        expect(data[1].name).toBe("Bob");
        expect(data[2].name).toBe("Charlie");
      });

      it("should sort by number column descending", async () => {
        await session.sort({ column: "age", order: "desc", comparator: "number" });
        const { data } = await session.getData();
        expect(data[0].age).toBe("35");
        expect(data[1].age).toBe("30");
        expect(data[2].age).toBe("25");
      });

      it("should sort by multiple columns", async () => {
        await session.load("dept,name,age\nIT,Alice,30\nHR,Bob,25\nIT,Charlie,35\nHR,David,40", {
          headers: true
        });
        await session.sort([
          { column: "dept", order: "asc" },
          { column: "age", order: "desc", comparator: "number" }
        ]);
        const { data } = await session.getData();
        expect(data[0]).toEqual({ dept: "HR", name: "David", age: "40" });
        expect(data[1]).toEqual({ dept: "HR", name: "Bob", age: "25" });
        expect(data[2]).toEqual({ dept: "IT", name: "Charlie", age: "35" });
        expect(data[3]).toEqual({ dept: "IT", name: "Alice", age: "30" });
      });
    });

    describe("filter", () => {
      beforeEach(async () => {
        await session.load("name,age,status\nAlice,30,active\nBob,25,inactive\nCharlie,35,active", {
          headers: true
        });
      });

      it("should filter with eq operator", async () => {
        const result = await session.filter({
          conditions: [{ column: "status", operator: "eq", value: "active" }]
        });
        expect(result.matchCount).toBe(2);
        expect(result.data.every(r => r.status === "active")).toBe(true);
      });

      it("should filter with gt operator", async () => {
        const result = await session.filter({
          conditions: [{ column: "age", operator: "gt", value: 28 }]
        });
        expect(result.matchCount).toBe(2);
        expect(result.data.map(r => r.name)).toContain("Alice");
        expect(result.data.map(r => r.name)).toContain("Charlie");
      });

      it("should filter with contains operator", async () => {
        const result = await session.filter({
          conditions: [{ column: "name", operator: "contains", value: "li" }]
        });
        expect(result.matchCount).toBe(2); // Alice, Charlie
      });

      it("should filter with AND logic", async () => {
        const result = await session.filter({
          conditions: [
            { column: "status", operator: "eq", value: "active" },
            { column: "age", operator: "gt", value: 32 }
          ],
          logic: "and"
        });
        expect(result.matchCount).toBe(1);
        expect(result.data[0].name).toBe("Charlie");
      });

      it("should filter with OR logic", async () => {
        const result = await session.filter({
          conditions: [
            { column: "name", operator: "eq", value: "Alice" },
            { column: "name", operator: "eq", value: "Bob" }
          ],
          logic: "or"
        });
        expect(result.matchCount).toBe(2);
      });

      it("should filter with case insensitive", async () => {
        const result = await session.filter({
          conditions: [{ column: "name", operator: "eq", value: "ALICE", ignoreCase: true }]
        });
        expect(result.matchCount).toBe(1);
        expect(result.data[0].name).toBe("Alice");
      });

      it("should filter with in operator", async () => {
        const result = await session.filter({
          conditions: [{ column: "name", operator: "in", value: ["Alice", "Bob"] }]
        });
        expect(result.matchCount).toBe(2);
      });

      it("should filter with isNull operator", async () => {
        await session.load("name,age\nAlice,30\nBob,\nCharlie,35", { headers: true });
        const result = await session.filter({
          conditions: [{ column: "age", operator: "isNull" }]
        });
        expect(result.matchCount).toBe(1);
        expect(result.data[0].name).toBe("Bob");
      });

      it("should filter with notNull operator", async () => {
        await session.load("name,age\nAlice,30\nBob,\nCharlie,35", { headers: true });
        const result = await session.filter({
          conditions: [{ column: "age", operator: "notNull" }]
        });
        expect(result.matchCount).toBe(2);
      });

      it("should filter with neq operator", async () => {
        const result = await session.filter({
          conditions: [{ column: "status", operator: "neq", value: "active" }]
        });
        expect(result.matchCount).toBe(1);
        expect(result.data[0].name).toBe("Bob");
      });

      it("should filter with lt and lte operators", async () => {
        const ltResult = await session.filter({
          conditions: [{ column: "age", operator: "lt", value: 30 }]
        });
        expect(ltResult.matchCount).toBe(1);
        expect(ltResult.data[0].name).toBe("Bob");

        const lteResult = await session.filter({
          conditions: [{ column: "age", operator: "lte", value: 30 }]
        });
        expect(lteResult.matchCount).toBe(2);
      });

      it("should filter with gte operator", async () => {
        const result = await session.filter({
          conditions: [{ column: "age", operator: "gte", value: 30 }]
        });
        expect(result.matchCount).toBe(2);
      });

      it("should filter with startsWith and endsWith operators", async () => {
        const startsResult = await session.filter({
          conditions: [{ column: "name", operator: "startsWith", value: "A" }]
        });
        expect(startsResult.matchCount).toBe(1);
        expect(startsResult.data[0].name).toBe("Alice");

        const endsResult = await session.filter({
          conditions: [{ column: "name", operator: "endsWith", value: "e" }]
        });
        expect(endsResult.matchCount).toBe(2); // Alice, Charlie
      });

      it("should filter with regex operator", async () => {
        const result = await session.filter({
          conditions: [{ column: "name", operator: "regex", value: "^[AB]" }]
        });
        expect(result.matchCount).toBe(2); // Alice, Bob
      });

      it("should filter with notIn operator", async () => {
        const result = await session.filter({
          conditions: [{ column: "name", operator: "notIn", value: ["Alice", "Bob"] }]
        });
        expect(result.matchCount).toBe(1);
        expect(result.data[0].name).toBe("Charlie");
      });
    });

    describe("search", () => {
      beforeEach(async () => {
        await session.load("name,email\nAlice,alice@example.com\nBob,bob@test.com", {
          headers: true
        });
      });

      it("should search across all columns", async () => {
        const result = await session.search({ query: "alice" });
        expect(result.matchCount).toBe(1);
        expect(result.data[0].name).toBe("Alice");
      });

      it("should search specific columns", async () => {
        const result = await session.search({ query: "alice", columns: ["name"] });
        expect(result.matchCount).toBe(1);
      });

      it("should be case insensitive by default", async () => {
        const result = await session.search({ query: "ALICE" });
        expect(result.matchCount).toBe(1);
      });
    });

    describe("groupBy", () => {
      beforeEach(async () => {
        await session.load(
          "dept,name,salary\nIT,Alice,100\nHR,Bob,80\nIT,Charlie,120\nHR,David,90",
          { headers: true }
        );
      });

      it("should group by single column with count", async () => {
        const result = await session.groupBy({
          columns: ["dept"],
          aggregates: [{ column: "name", fn: "count", alias: "count" }]
        });
        expect(result.groupCount).toBe(2);
        const itGroup = result.data.find(g => g.dept === "IT");
        const hrGroup = result.data.find(g => g.dept === "HR");
        expect(itGroup?.count).toBe(2);
        expect(hrGroup?.count).toBe(2);
      });

      it("should group with sum aggregate", async () => {
        const result = await session.groupBy({
          columns: ["dept"],
          aggregates: [{ column: "salary", fn: "sum", alias: "total" }]
        });
        const itGroup = result.data.find(g => g.dept === "IT");
        expect(itGroup?.total).toBe(220);
      });

      it("should group with multiple aggregates", async () => {
        const result = await session.groupBy({
          columns: ["dept"],
          aggregates: [
            { column: "salary", fn: "sum", alias: "total" },
            { column: "salary", fn: "avg", alias: "average" },
            { column: "salary", fn: "min", alias: "min" },
            { column: "salary", fn: "max", alias: "max" }
          ]
        });
        const itGroup = result.data.find(g => g.dept === "IT");
        expect(itGroup?.total).toBe(220);
        expect(itGroup?.average).toBe(110);
        expect(itGroup?.min).toBe(100);
        expect(itGroup?.max).toBe(120);
      });

      it("should group with first and last aggregates", async () => {
        const result = await session.groupBy({
          columns: ["dept"],
          aggregates: [
            { column: "name", fn: "first", alias: "firstName" },
            { column: "name", fn: "last", alias: "lastName" }
          ]
        });
        const itGroup = result.data.find(g => g.dept === "IT");
        expect(itGroup?.firstName).toBe("Alice");
        expect(itGroup?.lastName).toBe("Charlie");
      });

      it("should group by multiple columns", async () => {
        await session.load(
          "dept,level,name\nIT,senior,Alice\nIT,junior,Bob\nIT,senior,Charlie\nHR,junior,David",
          { headers: true }
        );
        const result = await session.groupBy({
          columns: ["dept", "level"],
          aggregates: [{ column: "name", fn: "count", alias: "count" }]
        });
        expect(result.groupCount).toBe(3);
        const itSenior = result.data.find(g => g.dept === "IT" && g.level === "senior");
        expect(itSenior?.count).toBe(2);
      });
    });

    describe("aggregate", () => {
      beforeEach(async () => {
        await session.load("name,salary\nAlice,100\nBob,80\nCharlie,120", { headers: true });
      });

      it("should compute aggregates", async () => {
        const result = await session.aggregate([
          { column: "salary", fn: "sum", alias: "total" },
          { column: "salary", fn: "avg", alias: "average" },
          { column: "name", fn: "count", alias: "count" }
        ]);
        expect(result.data.total).toBe(300);
        expect(result.data.average).toBe(100);
        expect(result.data.count).toBe(3);
      });
    });

    describe("getPage", () => {
      beforeEach(async () => {
        const rows = Array.from({ length: 100 }, (_, i) => `user${i},${i}`);
        await session.load("name,id\n" + rows.join("\n"), { headers: true });
      });

      it("should return correct page", async () => {
        const result = await session.getPage({ page: 1, pageSize: 10 });
        expect(result.data).toHaveLength(10);
        expect(result.page).toBe(1);
        expect(result.pageSize).toBe(10);
        expect(result.totalRows).toBe(100);
        expect(result.totalPages).toBe(10);
        expect(result.data[0].name).toBe("user0");
      });

      it("should return second page", async () => {
        const result = await session.getPage({ page: 2, pageSize: 10 });
        expect(result.data[0].name).toBe("user10");
      });

      it("should handle partial last page", async () => {
        const result = await session.getPage({ page: 4, pageSize: 30 });
        expect(result.data).toHaveLength(10);
        expect(result.totalPages).toBe(4);
      });
    });

    describe("query (batch API)", () => {
      beforeEach(async () => {
        await session.load(
          "name,age,status\nAlice,30,active\nBob,25,inactive\nCharlie,35,active\nDavid,40,active\nEve,28,inactive",
          { headers: true }
        );
      });

      it("should execute sort + filter + page in single round-trip", async () => {
        const result = await session.query({
          sort: { column: "age", order: "desc", comparator: "number" },
          filter: { conditions: [{ column: "status", operator: "eq", value: "active" }] },
          page: { page: 1, pageSize: 2 }
        });

        expect(result.data).toHaveLength(2);
        expect(result.matchCount).toBe(3); // 3 active users
        expect(result.page).toBe(1);
        expect(result.totalRows).toBe(3);
        expect(result.totalPages).toBe(2);
        // Sorted by age desc, so David (40) first, then Charlie (35)
        expect(result.data[0].name).toBe("David");
        expect(result.data[1].name).toBe("Charlie");
        expect(result.duration).toBeGreaterThanOrEqual(0);
      });

      it("should execute sort only", async () => {
        const result = await session.query({
          sort: { column: "name", order: "asc" }
        });

        expect(result.data).toHaveLength(5);
        expect(result.data[0].name).toBe("Alice");
        expect(result.data[4].name).toBe("Eve");
      });

      it("should execute filter only", async () => {
        const result = await session.query({
          filter: { conditions: [{ column: "age", operator: "gt", value: 30 }] }
        });

        expect(result.matchCount).toBe(2); // Charlie (35), David (40)
        expect(result.data).toHaveLength(2);
      });

      it("should execute search + page", async () => {
        const result = await session.query({
          search: { query: "li", columns: ["name"] },
          page: { page: 1, pageSize: 10 }
        });

        expect(result.matchCount).toBe(2); // Alice, Charlie (contain 'li')
        expect(result.data).toHaveLength(2);
        expect(result.page).toBe(1);
      });

      it("should execute groupBy + aggregates", async () => {
        const result = await session.query({
          groupBy: {
            columns: ["status"],
            aggregates: [
              { column: "age", fn: "avg", alias: "avgAge" },
              { column: "name", fn: "count", alias: "count" }
            ]
          }
        });

        expect(result.groupCount).toBe(2);
        const activeGroup = result.data.find((g: any) => g.status === "active");
        const inactiveGroup = result.data.find((g: any) => g.status === "inactive");
        expect(activeGroup?.count).toBe(3);
        expect(inactiveGroup?.count).toBe(2);
      });

      it("should execute aggregate without groupBy", async () => {
        const result = await session.query({
          aggregate: [
            { column: "age", fn: "sum", alias: "totalAge" },
            { column: "age", fn: "avg", alias: "avgAge" },
            { column: "name", fn: "count", alias: "total" }
          ]
        });

        expect(result.aggregates?.total).toBe(5);
        expect(result.aggregates?.totalAge).toBe(158); // 30+25+35+40+28
        expect(result.aggregates?.avgAge).toBeCloseTo(31.6, 1);
      });

      it("should handle empty config (returns all data)", async () => {
        const result = await session.query({});
        expect(result.data).toHaveLength(5);
      });

      it("should execute complex query with all operations", async () => {
        const result = await session.query({
          sort: { column: "age", order: "asc", comparator: "number" },
          filter: {
            conditions: [{ column: "age", operator: "gte", value: 28 }],
            logic: "and"
          },
          page: { page: 1, pageSize: 3 }
        });

        expect(result.matchCount).toBe(4); // Alice(30), Charlie(35), David(40), Eve(28)
        expect(result.page).toBe(1);
        expect(result.pageSize).toBe(3);
        expect(result.totalPages).toBe(2);
        expect(result.data).toHaveLength(3);
        // Sorted by age asc: Eve(28), Alice(30), Charlie(35)
        expect(result.data[0].name).toBe("Eve");
        expect(result.data[1].name).toBe("Alice");
        expect(result.data[2].name).toBe("Charlie");
      });
    });

    describe("dispose", () => {
      it("should clear session data", async () => {
        await session.load("a,b\n1,2", { headers: true });
        await session.dispose();
        // Session should be disposed
      });

      it("should be idempotent", async () => {
        await session.load("a,b\n1,2", { headers: true });
        await session.dispose();
        await session.dispose();
        await session.dispose();
      });

      it("should reject operations after dispose", async () => {
        await session.load("a,b\n1,2", { headers: true });
        await session.dispose();
        await expect(session.getData()).rejects.toThrow("disposed");
      });
    });
  });

  // ===========================================================================
  // Convenience Functions Tests
  // ===========================================================================

  describe("Convenience Functions", () => {
    afterEach(() => {
      terminateDefaultWorkerPool();
    });

    describe("parseWithPool", () => {
      it("should parse CSV", async () => {
        const result = await parseWithPool("a,b\n1,2");
        expect(result.data).toEqual([
          ["a", "b"],
          ["1", "2"]
        ]);
      });

      it("should support options", async () => {
        const result = await parseWithPool("name,age\nAlice,30", { headers: true });
        expect(result.data).toEqual({
          headers: ["name", "age"],
          rows: [{ name: "Alice", age: "30" }]
        });
      });
    });

    describe("formatWithPool", () => {
      it("should format data", async () => {
        const result = await formatWithPool([
          ["a", "b"],
          [1, 2]
        ]);
        expect(result.data).toBe("a,b\n1,2");
      });
    });

    describe("getDefaultWorkerPool", () => {
      it("should return same instance", () => {
        const pool1 = getDefaultWorkerPool();
        const pool2 = getDefaultWorkerPool();
        expect(pool1).toBe(pool2);
      });
    });

    describe("terminateDefaultWorkerPool", () => {
      it("should terminate and reset pool", () => {
        const pool1 = getDefaultWorkerPool();
        terminateDefaultWorkerPool();
        const pool2 = getDefaultWorkerPool();
        expect(pool2).not.toBe(pool1);
      });

      it("should be safe to call multiple times", () => {
        terminateDefaultWorkerPool();
        terminateDefaultWorkerPool();
        terminateDefaultWorkerPool();
      });
    });
  });

  // ===========================================================================
  // Priority & AbortSignal Tests
  // ===========================================================================

  describe("Task Priority", () => {
    let pool: CsvWorkerPool;

    beforeEach(() => {
      pool = new CsvWorkerPool({ maxWorkers: 1 });
    });

    afterEach(() => {
      pool.terminate();
    });

    it("should prioritize high priority tasks in queue", async () => {
      // Start a blocking task first
      const blockingTask = pool.parse("x,y,z\n1,2,3\n4,5,6");

      // Queue tasks with different priorities while first is running
      const order: string[] = [];
      const lowTask = pool
        .parse("low", undefined, { priority: "low" })
        .then(() => order.push("low"));
      const highTask = pool
        .parse("high", undefined, { priority: "high" })
        .then(() => order.push("high"));
      const normalTask = pool
        .parse("normal", undefined, { priority: "normal" })
        .then(() => order.push("normal"));

      await Promise.all([blockingTask, lowTask, highTask, normalTask]);

      // High should be processed before low (they were queued while first was running)
      const highIdx = order.indexOf("high");
      const lowIdx = order.indexOf("low");
      expect(highIdx).toBeLessThan(lowIdx);
    });
  });

  describe("AbortSignal", () => {
    let pool: CsvWorkerPool;

    beforeEach(() => {
      pool = new CsvWorkerPool({ maxWorkers: 1 });
    });

    afterEach(() => {
      pool.terminate();
    });

    it("should reject with AbortError when already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(pool.parse("a,b", undefined, { signal: controller.signal })).rejects.toThrow(
        "abort"
      );
    });

    it("should support AbortSignal for cancellation", async () => {
      const controller = new AbortController();

      // Immediately abort and try to parse
      controller.abort();

      try {
        await pool.parse("x,y", undefined, { signal: controller.signal });
        expect.fail("Expected task to reject");
      } catch (err: any) {
        expect(err.name === "AbortError" || err.message.includes("abort")).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Performance Tests
  // ===========================================================================

  describe("Performance", () => {
    let pool: CsvWorkerPool;

    beforeEach(() => {
      pool = new CsvWorkerPool({ maxWorkers: 4 });
    });

    afterEach(() => {
      pool.terminate();
    });

    it("should handle concurrent tasks", async () => {
      const tasks = Array.from({ length: 10 }, (_, i) => pool.parse(`col${i}\nval${i}`));

      const results = await Promise.all(tasks);

      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result.data).toEqual([[`col${i}`], [`val${i}`]]);
      });
    });

    it("should handle large CSV", async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => `${i},${i * 2},${i * 3}`);
      const csv = "a,b,c\n" + rows.join("\n");

      const result = await pool.parse(csv);
      expect(result.data).toHaveLength(1001);
    });

    it("should report duration", async () => {
      const result = await pool.parse("a,b,c\n1,2,3");
      expect(typeof result.duration).toBe("number");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("Edge Cases", () => {
    let pool: CsvWorkerPool;

    beforeEach(() => {
      pool = new CsvWorkerPool({ maxWorkers: 2 });
    });

    afterEach(() => {
      pool.terminate();
    });

    it("should handle empty string", async () => {
      const result = await pool.parse("");
      expect(result.data).toEqual([]);
    });

    it("should handle single value", async () => {
      const result = await pool.parse("value");
      expect(result.data).toEqual([["value"]]);
    });

    it("should handle special characters", async () => {
      const result = await pool.parse('emoji,text\n"😀","Hello 世界"');
      expect(result.data).toEqual([
        ["emoji", "text"],
        ["😀", "Hello 世界"]
      ]);
    });

    it("should handle Windows line endings", async () => {
      const result = await pool.parse("a,b\r\n1,2\r\n3,4");
      expect(result.data).toEqual([
        ["a", "b"],
        ["1", "2"],
        ["3", "4"]
      ]);
    });

    it("should handle null and undefined in format", async () => {
      const result = await pool.format([[null, undefined, "value"]]);
      expect(result.data).toBe(",,value");
    });

    it("should handle session not found error", async () => {
      await expect(pool.getData("nonexistent-session")).rejects.toThrow("Session not found");
    });
  });
});
