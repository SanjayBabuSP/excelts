/**
 * CSV Encoding & Character Set Tests
 *
 * Tests for:
 * - Various BOM types (UTF-8, UTF-16 LE/BE)
 * - Unicode character handling
 * - Multi-byte character edge cases
 * - Right-to-left text
 * - Combining characters and diacritics
 */

import { describe, it, expect } from "vitest";
import { parseCsv, formatCsv, stripBom } from "@csv/index";
import { CsvParserStream } from "@csv/csv-stream";
import { parseStreamCsv } from "./csv-test-utils";

// =============================================================================
// BOM Handling Tests
// =============================================================================
describe("BOM", () => {
  describe("UTF-8 BOM", () => {
    const UTF8_BOM = "\ufeff";

    it("strips from start", () => {
      const csv = UTF8_BOM + "a,b\n1,2";
      const result = parseCsv(csv) as string[][];

      expect(result[0][0]).toBe("a");
      expect(result[0][0]).not.toBe(UTF8_BOM + "a");
    });

    it("preserves in middle", () => {
      const csv = "a" + UTF8_BOM + "b,c\n1,2";
      const result = parseCsv(csv) as string[][];

      expect(result[0][0]).toBe("a" + UTF8_BOM + "b");
    });

    it("strips with headers mode", () => {
      const csv = UTF8_BOM + "name,value\ntest,123";
      const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

      expect(result.rows[0]).toHaveProperty("name");
      expect(result.rows[0]).not.toHaveProperty(UTF8_BOM + "name");
    });

    it("strips in streaming", async () => {
      const csv = UTF8_BOM + "name,value\ntest,123";
      const parser = new CsvParserStream({ headers: true });
      const rows = await parseStreamCsv<Record<string, string>>(csv, parser);

      expect(rows[0]).toHaveProperty("name");
    });

    it("stripBom helper works", () => {
      expect(stripBom(UTF8_BOM + "hello")).toBe("hello");
      expect(stripBom("hello")).toBe("hello");
      expect(stripBom("")).toBe("");
      expect(stripBom(UTF8_BOM)).toBe("");
    });
  });

  describe("edge cases", () => {
    it("handles BOM-only file", () => {
      const csv = "\ufeff";
      const result = parseCsv(csv) as string[][];

      expect(result).toEqual([]);
    });

    it("handles BOM + empty line", () => {
      const csv = "\ufeff\na,b";
      const result = parseCsv(csv, { skipEmptyLines: true }) as string[][];

      expect(result[0]).toEqual(["a", "b"]);
    });
  });
});

// =============================================================================
// Unicode Content Tests
// =============================================================================
describe("unicode", () => {
  describe("CJK", () => {
    it("parses Chinese", () => {
      const csv = "姓名,年龄,城市\n张三,25,北京\n李四,30,上海";
      const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

      expect(result.rows[0]).toEqual({ 姓名: "张三", 年龄: "25", 城市: "北京" });
      expect(result.rows[1]).toEqual({ 姓名: "李四", 年龄: "30", 城市: "上海" });
    });

    it("parses Japanese", () => {
      const csv = "名前,カテゴリ,説明\nテスト,ひらがな,漢字";
      const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

      expect(result.rows[0]).toEqual({ 名前: "テスト", カテゴリ: "ひらがな", 説明: "漢字" });
    });

    it("parses Korean", () => {
      const csv = "이름,나이\n홍길동,25\n김철수,30";
      const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

      expect(result.rows[0].이름).toBe("홍길동");
    });

    it("parses mixed CJK", () => {
      const csv = "中文,日本語,한국어\n你好,こんにちは,안녕하세요";
      const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

      expect(Object.keys(result.rows[0])).toEqual(["中文", "日本語", "한국어"]);
    });
  });

  describe("emoji", () => {
    it("parses basic emoji", () => {
      const csv = "emoji,text\n😀,happy\n😢,sad\n🎉,party";
      const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

      expect(result.rows[0].emoji).toBe("😀");
      expect(result.rows[1].emoji).toBe("😢");
      expect(result.rows[2].emoji).toBe("🎉");
    });

    it("parses quoted emoji", () => {
      const csv = 'emoji,description\n"🎉🎊","Party time!"';
      const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

      expect(result.rows[0].emoji).toBe("🎉🎊");
    });

    it("parses skin tone modifiers", () => {
      const csv = "hand\n👋\n👋🏻\n👋🏿";
      const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

      expect(result.rows).toHaveLength(3);
    });

    it("parses ZWJ sequences", () => {
      // Family emoji: 👨‍👩‍👧‍👦
      const csv = "family\n👨‍👩‍👧‍👦";
      const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

      expect(result.rows[0].family).toBe("👨‍👩‍👧‍👦");
    });

    it("parses flag emoji", () => {
      const csv = "flag,country\n🇺🇸,USA\n🇯🇵,Japan\n🇨🇳,China";
      const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

      expect(result.rows[0].flag).toBe("🇺🇸");
    });
  });

  describe("special chars", () => {
    it("handles zero-width", () => {
      // Zero-width space (U+200B)
      const csv = "a\u200Bb,c\n1,2";
      const result = parseCsv(csv) as string[][];

      expect(result[0][0]).toBe("a\u200Bb");
    });

    it("handles combining chars", () => {
      // e + combining acute accent = é (but stored as two code points)
      const csv = "cafe\u0301,test\nvalue,data";
      const result = parseCsv(csv) as string[][];

      // The parser preserves the original characters (e + combining accent)
      // It does NOT normalize to precomposed form
      expect(result[0][0]).toBe("cafe\u0301");
      // Visual appearance should be the same as café
      expect(result[0][0].normalize("NFC")).toBe("café");
    });

    it("handles RTL text", () => {
      // Arabic and Hebrew
      const csv = "arabic,hebrew\nمرحبا,שלום";
      const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

      expect(result.rows[0].arabic).toBe("مرحبا");
      expect(result.rows[0].hebrew).toBe("שלום");
    });

    it("handles bidirectional mixing", () => {
      const csv = "mixed\nHello مرحبا World";
      const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

      expect(result.rows[0].mixed).toBe("Hello مرحبا World");
    });

    it("handles math symbols", () => {
      const csv = "formula,result\n∑(x),∞\n√2,1.414";
      const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

      expect(result.rows[0].formula).toBe("∑(x)");
      expect(result.rows[0].result).toBe("∞");
    });

    it("handles currency symbols", () => {
      const csv = "currency,amount\n$,100\n€,85\n¥,12000\n₿,0.5";
      const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

      expect(result.rows.map(r => r.currency)).toEqual(["$", "€", "¥", "₿"]);
    });
  });
});

// =============================================================================
// Format & Roundtrip Tests
// =============================================================================
describe("roundtrip", () => {
  it("roundtrips Chinese", () => {
    const original = [
      ["姓名", "城市"],
      ["张三", "北京"]
    ];
    const csv = formatCsv(original, { trailingNewline: false });
    const parsed = parseCsv(csv) as string[][];

    expect(parsed).toEqual(original);
  });

  it("roundtrips emoji", () => {
    const original = [
      ["emoji", "text"],
      ["😀", "happy"]
    ];
    const csv = formatCsv(original, { trailingNewline: false });
    const parsed = parseCsv(csv) as string[][];

    expect(parsed).toEqual(original);
  });

  it("roundtrips RTL", () => {
    const original = [
      ["text"],
      ["مرحبا بالعالم"] // Hello World in Arabic
    ];
    const csv = formatCsv(original, { trailingNewline: false });
    const parsed = parseCsv(csv) as string[][];

    expect(parsed).toEqual(original);
  });

  it("roundtrips mixed unicode", () => {
    const original = [["data"], ["Hello, 世界! 🎉 مرحبا"]];
    const csv = formatCsv(original, { trailingNewline: false });
    const parsed = parseCsv(csv) as string[][];

    expect(parsed).toEqual(original);
  });
});

// =============================================================================
// Streaming Unicode Tests
// =============================================================================
describe("streaming unicode", () => {
  it("handles cross-chunk splits", async () => {
    // Multi-byte characters might be split across chunks
    const csv = "name,value\n张三,100\n李四,200";
    const parser = new CsvParserStream({ headers: true });
    const rows = await parseStreamCsv<Record<string, string>>(csv, parser);

    expect(rows[0].name).toBe("张三");
    expect(rows[1].name).toBe("李四");
  });

  it("streams emoji", async () => {
    const csv = "emoji\n😀\n😢\n🎉";
    const parser = new CsvParserStream({ headers: true });
    const rows = await parseStreamCsv<Record<string, string>>(csv, parser);

    expect(rows.map(r => r.emoji)).toEqual(["😀", "😢", "🎉"]);
  });

  it("streams long unicode", async () => {
    const longUnicode = "你好世界".repeat(100);
    const csv = `content\n"${longUnicode}"`;
    const parser = new CsvParserStream({ headers: true });
    const rows = await parseStreamCsv<Record<string, string>>(csv, parser);

    expect(rows[0].content).toBe(longUnicode);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================
describe("edge cases", () => {
  it("handles surrogate pairs", () => {
    // Characters outside BMP (emoji, rare CJK)
    const csv = "char\n𠀀\n𝕳";
    const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

    expect(result.rows[0].char).toBe("𠀀");
    expect(result.rows[1].char).toBe("𝕳");
  });

  it("handles variation selectors", () => {
    // Text style vs emoji style
    const csv = "style\n☺\n☺️";
    const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

    expect(result.rows).toHaveLength(2);
  });

  it("handles PUA chars", () => {
    // Private Use Area character
    const csv = "pua\n\ue000";
    const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

    expect(result.rows[0].pua).toBe("\ue000");
  });

  it("handles 40K-char field", () => {
    const longContent = "中文字符".repeat(10000);
    const csv = `content\n"${longContent}"`;
    const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

    expect(result.rows[0].content.length).toBe(longContent.length);
  });

  it("handles unicode headers", () => {
    const csv = "名前,年齢,住所\nテスト,25,東京";
    const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

    expect(result.rows[0]["名前"]).toBe("テスト");
    expect(result.rows[0]["年齢"]).toBe("25");
    expect(result.rows[0]["住所"]).toBe("東京");
  });

  it("handles unicode with quotes/commas", () => {
    const csv = 'greeting\n"你好, 世界！"';
    const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

    expect(result.rows[0].greeting).toBe("你好, 世界！");
  });

  it("handles unicode newlines", () => {
    const csv = 'content\n"第一行\n第二行\n第三行"';
    const result = parseCsv(csv, { headers: true }) as { rows: Record<string, string>[] };

    expect(result.rows[0].content).toBe("第一行\n第二行\n第三行");
  });
});

// =============================================================================
// fastMode with Unicode
// =============================================================================
describe("fastMode unicode", () => {
  it("parses unicode", () => {
    const csv = "名前,年齢\nテスト,25";
    const result = parseCsv(csv, { fastMode: true }) as string[][];

    expect(result[0]).toEqual(["名前", "年齢"]);
    expect(result[1]).toEqual(["テスト", "25"]);
  });

  it("parses emoji", () => {
    const csv = "😀,😢\n🎉,🌍";
    const result = parseCsv(csv, { fastMode: true }) as string[][];

    expect(result[0]).toEqual(["😀", "😢"]);
    expect(result[1]).toEqual(["🎉", "🌍"]);
  });

  it("parses mixed unicode/ASCII", () => {
    const csv = "hello,世界\ntest,テスト";
    const result = parseCsv(csv, { fastMode: true }) as string[][];

    expect(result[0]).toEqual(["hello", "世界"]);
    expect(result[1]).toEqual(["test", "テスト"]);
  });
});
