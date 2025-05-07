import { NextResponse } from "next/server";

interface DuneRow {
  parent_fid: string | null;
  fid: string | null;
  all_time_peanut_count: number | null;
  rank: number | null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fid = searchParams.get('fid');

  if (!fid) {
    return NextResponse.json(
      { error: "FID is required" },
      { status: 400 }
    );
  }

  console.log("[API:dune-stats] Fetching data for FID:", fid);
  
  try {
    const { Database } = await import("@sqlitecloud/drivers");
    
    const connectionString = "sqlitecloud://cntihai1nk.g4.sqlite.cloud:8860/dune_data.db?apikey=GEKHc2AnfNuuZQvBjekbuOP7QHlFWPHSHPChPKswA4c";
    console.log("[API:dune-stats] Connecting to SQLite Cloud");
    
    const db = new Database(connectionString);
    
    // Test connection
    try {
      await db.sql`SELECT 1;`;
      console.log("[API:dune-stats] SQLite connection successful");
    } catch (connErr) {
      console.error("[API:dune-stats] Failed to establish SQLite connection:", connErr);
      return NextResponse.json(
        { error: "Database connection failed" },
        { status: 500 }
      );
    }

    console.log("[API:dune-stats] Executing query: SELECT * FROM peanut_data");
    const rows = await db.sql`SELECT * FROM peanut_data;` as DuneRow[];
    console.log("[API:dune-stats] Query returned", rows?.length || 0, "rows");

    if (!rows || rows.length === 0) {
      console.error("[API:dune-stats] No data returned from SQLite Cloud");
      return NextResponse.json(
        { allTimeEarning: 0, rank: 0 },
        { status: 200 }
      );
    }

    console.log("[API:dune-stats] Looking for FID:", fid, "in dataset");
    const userData = rows.find(
      (row: DuneRow) =>
        String(row.parent_fid) === String(fid) ||
        String(row.fid) === String(fid)
    );

    if (!userData) {
      console.error("[API:dune-stats] No data found for FID:", fid);
      return NextResponse.json(
        { allTimeEarning: 0, rank: 0 },
        { status: 200 }
      );
    }

    console.log("[API:dune-stats] Found userData:", userData);
    const result = { 
      allTimeEarning: userData.all_time_peanut_count || 0, 
      rank: userData.rank || 0 
    };
    
    console.log("[API:dune-stats] Returning:", result);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[API:dune-stats] Failed to fetch data:", err);
    return NextResponse.json(
      { error: "Failed to fetch data", details: String(err) },
      { status: 500 }
    );
  }
}