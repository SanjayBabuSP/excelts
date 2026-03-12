/**
 * Pivot Table Examples — 25 variations showcasing all supported features
 * Usage: npx tsx src/modules/excel/examples/pivot-tables.ts
 */
import { Workbook, type PivotTableValue } from "../../../index";

async function main() {
  const workbook = new Workbook();

  // ========== Sheet 1: Sales data source (Table) ==========
  const dataSheet = workbook.addWorksheet("Sales Data");

  const headers = [
    "Region",
    "City",
    "Category",
    "Product",
    "Year",
    "Quarter",
    "Month",
    "Revenue",
    "Cost",
    "Quantity",
    "Margin",
    "Customer Type",
    "Channel"
  ];

  const regions: Record<string, string[]> = {
    East: ["New York", "Boston", "Philadelphia", "Baltimore"],
    West: ["Los Angeles", "San Francisco", "Seattle"],
    South: ["Houston", "Miami", "Atlanta"],
    Midwest: ["Chicago", "Detroit", "Minneapolis"],
    Mountain: ["Denver", "Phoenix"]
  };

  const products: Record<string, string[]> = {
    Electronics: ["Laptop", "Smartphone", "Tablet", "Headphones"],
    "Office Supplies": ["Paper", "Pens", "Folders", "Stapler"],
    "Home Goods": ["Desk Lamp", "Storage Box", "Cushion", "Vase"]
  };

  const years = [2023, 2024, 2025];
  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const customerTypes = ["Enterprise", "Consumer", "Government"];
  const channels = ["Online", "Retail", "Distributor"];

  const rows: (string | number)[][] = [];

  for (const [region, cities] of Object.entries(regions)) {
    for (const city of cities) {
      for (const [category, items] of Object.entries(products)) {
        for (const product of items) {
          for (const year of years) {
            for (const [qi, quarter] of quarters.entries()) {
              const month = qi * 3 + Math.floor(Math.random() * 3) + 1;
              const basePrice =
                category === "Electronics" ? 3000 : category === "Office Supplies" ? 50 : 200;
              const revenue = Math.round(basePrice * (0.5 + Math.random() * 1.5) * 100) / 100;
              const cost = Math.round(revenue * (0.4 + Math.random() * 0.3) * 100) / 100;
              const qty = Math.floor(1 + Math.random() * 100);
              const margin = Math.round(((revenue - cost) / revenue) * 100) / 100;
              const custType = customerTypes[Math.floor(Math.random() * customerTypes.length)];
              const channel = channels[Math.floor(Math.random() * channels.length)];

              rows.push([
                region,
                city,
                category,
                product,
                year,
                quarter,
                month,
                revenue,
                cost,
                qty,
                margin,
                custType,
                channel
              ]);
            }
          }
        }
      }
    }
  }

  const table = dataSheet.addTable({
    name: "SalesData",
    ref: "A1",
    headerRow: true,
    columns: headers.map(name => ({ name })),
    rows
  });

  // ========== Sheet 2: Second data source (sourceSheet, no Table) ==========
  const dataSheet2 = workbook.addWorksheet("Employee Performance");
  const empHeaders = [
    "Department",
    "Level",
    "Employee",
    "Review Year",
    "Score",
    "Projects",
    "Bonus"
  ];
  const departments = ["Engineering", "Marketing", "Sales", "Finance", "HR"];
  const levels = ["L3", "L4", "L5", "L6", "L7"];
  const empNames = [
    "Alice",
    "Bob",
    "Carol",
    "Dave",
    "Eve",
    "Frank",
    "Grace",
    "Hank",
    "Ivy",
    "Jack",
    "Kate",
    "Leo",
    "Mia",
    "Nick",
    "Olivia",
    "Paul",
    "Quinn",
    "Ryan",
    "Sara",
    "Tom"
  ];

  const empRows: (string | number)[][] = [];
  for (const dept of departments) {
    for (const level of levels) {
      for (let i = 0; i < 4; i++) {
        const name = empNames[(departments.indexOf(dept) * 4 + i) % empNames.length];
        for (const year of [2023, 2024, 2025]) {
          const score = Math.round((60 + Math.random() * 40) * 10) / 10;
          const numProjects = Math.floor(1 + Math.random() * 10);
          const bonus = Math.round(score * 100 * (levels.indexOf(level) + 1));
          empRows.push([dept, level, name, year, score, numProjects, bonus]);
        }
      }
    }
  }

  dataSheet2.addRows([empHeaders, ...empRows]);

  // ==========================================================================
  // 25 Pivot Table Variations
  // ==========================================================================

  // ---------- 1. Classic: rows + columns + single value + sum ----------
  const s1 = workbook.addWorksheet("1-Classic");
  s1.addPivotTable({
    sourceTable: table,
    rows: ["Region"],
    columns: ["Category"],
    values: ["Revenue"],
    metric: "sum"
  });

  // ---------- 2. Multi-level row fields + columns + sum ----------
  const s2 = workbook.addWorksheet("2-Multi Row");
  s2.addPivotTable({
    sourceTable: table,
    rows: ["Region", "City"],
    columns: ["Category"],
    values: ["Revenue"],
    metric: "sum"
  });

  // ---------- 3. Three-level rows, no columns ----------
  const s3 = workbook.addWorksheet("3-Three Rows No Cols");
  s3.addPivotTable({
    sourceTable: table,
    rows: ["Region", "City", "Category"],
    columns: [],
    values: ["Revenue"],
    metric: "sum"
  });

  // ---------- 4. Count aggregation ----------
  const s4 = workbook.addWorksheet("4-Count");
  s4.addPivotTable({
    sourceTable: table,
    rows: ["Category", "Product"],
    columns: ["Year"],
    values: ["Quantity"],
    metric: "count"
  });

  // ---------- 5. Multiple value fields (no columns) ----------
  const s5 = workbook.addWorksheet("5-Multi Values");
  s5.addPivotTable({
    sourceTable: table,
    rows: ["Region"],
    columns: [],
    values: ["Revenue", "Cost", "Quantity"],
    metric: "sum"
  });

  // ---------- 6. Single page filter ----------
  const s6 = workbook.addWorksheet("6-Single Filter");
  s6.addPivotTable({
    sourceTable: table,
    rows: ["Category"],
    columns: ["Quarter"],
    values: ["Revenue"],
    pages: ["Year"],
    metric: "sum"
  });

  // ---------- 7. Two page filters ----------
  const s7 = workbook.addWorksheet("7-Two Filters");
  s7.addPivotTable({
    sourceTable: table,
    rows: ["City"],
    columns: ["Channel"],
    values: ["Revenue"],
    pages: ["Region", "Year"],
    metric: "sum"
  });

  // ---------- 8. Three page filters (maximum) ----------
  const s8 = workbook.addWorksheet("8-Three Filters");
  s8.addPivotTable({
    sourceTable: table,
    rows: ["Product"],
    columns: [],
    values: ["Revenue", "Quantity"],
    pages: ["Region", "Category", "Year"],
    metric: "sum"
  });

  // ---------- 9. Numeric field as row (numeric sharedItems) ----------
  const s9 = workbook.addWorksheet("9-Numeric Row");
  s9.addPivotTable({
    sourceTable: table,
    rows: ["Month"],
    columns: ["Year"],
    values: ["Revenue"],
    metric: "sum"
  });

  // ---------- 10. Same field as row and value (dataField=1) ----------
  const s10 = workbook.addWorksheet("10-Same Row Value");
  s10.addPivotTable({
    sourceTable: table,
    rows: ["Quantity"],
    columns: [],
    values: ["Quantity"],
    metric: "count"
  });

  // ---------- 11. Minimal: single row, single value ----------
  const s11 = workbook.addWorksheet("11-Minimal");
  s11.addPivotTable({
    sourceTable: table,
    rows: ["Year"],
    values: ["Revenue"],
    metric: "sum"
  });

  // ---------- 12. Preserve column widths (applyWidthHeightFormats=0) ----------
  const s12 = workbook.addWorksheet("12-Preserve Widths");
  s12.getColumn(1).width = 40;
  s12.getColumn(2).width = 25;
  s12.getColumn(3).width = 20;
  s12.addPivotTable({
    sourceTable: table,
    rows: ["Region", "City"],
    columns: ["Quarter"],
    values: ["Cost"],
    metric: "sum",
    applyWidthHeightFormats: "0"
  });

  // ---------- 13. Customer type dimension ----------
  const s13 = workbook.addWorksheet("13-Customer Type");
  s13.addPivotTable({
    sourceTable: table,
    rows: ["Customer Type"],
    columns: ["Channel"],
    values: ["Revenue"],
    pages: ["Year"],
    metric: "sum"
  });

  // ---------- 14. Channel x Quarter + multiple page filters ----------
  const s14 = workbook.addWorksheet("14-Channel Quarter");
  s14.addPivotTable({
    sourceTable: table,
    rows: ["Channel", "Customer Type"],
    columns: ["Quarter"],
    values: ["Quantity"],
    pages: ["Region", "Category"],
    metric: "sum"
  });

  // ---------- 15. sourceSheet (non-Table data source) ----------
  const s15 = workbook.addWorksheet("15-Source Sheet");
  s15.addPivotTable({
    sourceSheet: dataSheet2,
    rows: ["Department"],
    columns: ["Review Year"],
    values: ["Score"],
    metric: "sum"
  });

  // ---------- 16. sourceSheet + count + page filter ----------
  const s16 = workbook.addWorksheet("16-Employee Count");
  s16.addPivotTable({
    sourceSheet: dataSheet2,
    rows: ["Department", "Level"],
    columns: [],
    values: ["Projects"],
    pages: ["Review Year"],
    metric: "count"
  });

  // ---------- 17. sourceSheet with multiple values ----------
  const s17 = workbook.addWorksheet("17-Employee Metrics");
  s17.addPivotTable({
    sourceSheet: dataSheet2,
    rows: ["Department"],
    columns: [],
    values: ["Score", "Projects", "Bonus"],
    metric: "sum"
  });

  // ---------- 18. Four-level row nesting (deepest) ----------
  const s18 = workbook.addWorksheet("18-Four Row Levels");
  s18.addPivotTable({
    sourceTable: table,
    rows: ["Region", "City", "Category", "Product"],
    columns: [],
    values: ["Revenue"],
    metric: "sum"
  });

  // ---------- 19. Margin as value + channel columns + multiple pages ----------
  const s19 = workbook.addWorksheet("19-Margin Analysis");
  s19.addPivotTable({
    sourceTable: table,
    rows: ["Category", "Product"],
    columns: ["Channel"],
    values: ["Margin"],
    pages: ["Region", "Year", "Customer Type"],
    metric: "sum"
  });

  // ---------- 20. Full dimensions: 3 rows + 3 values + 2 pages ----------
  const s20 = workbook.addWorksheet("20-Full Dimensions");
  s20.addPivotTable({
    sourceTable: table,
    rows: ["Category", "Channel", "Customer Type"],
    columns: [],
    values: ["Revenue", "Cost", "Quantity"],
    pages: ["Region", "Year"],
    metric: "sum"
  });

  // ---------- 21. Average aggregation ----------
  const s21 = workbook.addWorksheet("21-Average");
  s21.addPivotTable({
    sourceTable: table,
    rows: ["Region"],
    columns: ["Category"],
    values: ["Revenue"],
    metric: "average"
  });

  // ---------- 22. Max aggregation ----------
  const s22 = workbook.addWorksheet("22-Max");
  s22.addPivotTable({
    sourceTable: table,
    rows: ["Category", "Product"],
    columns: ["Year"],
    values: ["Revenue"],
    metric: "max"
  });

  // ---------- 23. Per-value metric overrides ----------
  const perValueMetrics: PivotTableValue[] = [
    { name: "Revenue", metric: "sum" },
    { name: "Quantity", metric: "count" },
    { name: "Margin", metric: "average" }
  ];
  const s23 = workbook.addWorksheet("23-Mixed Metrics");
  s23.addPivotTable({
    sourceTable: table,
    rows: ["Region", "Category"],
    columns: [],
    values: perValueMetrics,
    metric: "sum"
  });

  // ---------- 24. Per-value overrides + columns + pages ----------
  const s24 = workbook.addWorksheet("24-Mixed Full");
  s24.addPivotTable({
    sourceTable: table,
    rows: ["Channel", "Customer Type"],
    columns: ["Quarter"],
    values: [
      { name: "Revenue", metric: "sum" },
      { name: "Cost", metric: "min" },
      { name: "Quantity", metric: "max" },
      "Margin" // inherits table-wide metric (stdDev)
    ],
    pages: ["Region", "Year"],
    metric: "stdDev"
  });

  // ---------- 25. Multi column fields (sourceSheet with 2 column axes) ----------
  const s25 = workbook.addWorksheet("25-Multi Column Fields");
  s25.addPivotTable({
    sourceSheet: dataSheet2,
    rows: ["Department", "Level", "Employee"],
    columns: ["Review Year", "Projects"],
    values: ["Bonus"],
    metric: "sum"
  });

  // Write output
  const outPath = "out/pivot-tables-example.xlsx";
  await workbook.xlsx.writeFile(outPath);
  console.log(`Done! ${rows.length} sales rows + ${empRows.length} employee rows`);
  console.log(`Generated 25 pivot tables -> ${outPath}`);
  console.log(`
Pivot Table List:
 1  Classic              rows=Region, cols=Category, val=Revenue(sum)
 2  Multi Row            rows=Region+City, cols=Category, val=Revenue(sum)
 3  Three Rows No Cols   rows=Region+City+Category, val=Revenue(sum)
 4  Count                rows=Category+Product, cols=Year, val=Quantity(count)
 5  Multi Values         rows=Region, vals=Revenue+Cost+Quantity(sum)
 6  Single Filter        rows=Category, cols=Quarter, val=Revenue(sum), page=Year
 7  Two Filters          rows=City, cols=Channel, val=Revenue(sum), pages=Region+Year
 8  Three Filters        rows=Product, vals=Revenue+Quantity(sum), pages=Region+Category+Year
 9  Numeric Row          rows=Month(numeric), cols=Year(numeric), val=Revenue(sum)
10  Same Row Value       rows=Quantity, val=Quantity(count), dataField=1
11  Minimal              rows=Year, val=Revenue(sum)
12  Preserve Widths      rows=Region+City, cols=Quarter, val=Cost(sum), applyWidthHeightFormats=0
13  Customer Type        rows=CustomerType, cols=Channel, val=Revenue(sum), page=Year
14  Channel Quarter      rows=Channel+CustomerType, cols=Quarter, val=Quantity(sum), pages=Region+Category
15  Source Sheet          rows=Department, cols=ReviewYear, val=Score(sum) [sourceSheet]
16  Employee Count       rows=Department+Level, val=Projects(count), page=ReviewYear
17  Employee Metrics     rows=Department, vals=Score+Projects+Bonus(sum)
18  Four Row Levels      rows=Region+City+Category+Product, val=Revenue(sum)
19  Margin Analysis      rows=Category+Product, cols=Channel, val=Margin(sum), pages=Region+Year+CustomerType
20  Full Dimensions      rows=Category+Channel+CustomerType, vals=Revenue+Cost+Quantity(sum), pages=Region+Year
21  Average              rows=Region, cols=Category, val=Revenue(average)
22  Max                  rows=Category+Product, cols=Year, val=Revenue(max)
23  Mixed Metrics        rows=Region+Category, vals=Revenue(sum)+Quantity(count)+Margin(average) [per-value]
24  Mixed Full           rows=Channel+CustomerType, cols=Quarter, vals=Revenue(sum)+Cost(min)+Quantity(max)+Margin(stdDev) [per-value+pages]
25  Multi Column Fields  rows=Department+Level+Employee, cols=ReviewYear+Projects, val=Bonus(sum) [multi-column]
`);
}

main().catch(console.error);
