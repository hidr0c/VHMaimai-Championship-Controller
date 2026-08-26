import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Force Node.js runtime for file system access
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Song {
  id: string;
  imgUrl: string;
  artist: string;
  title: string;
  lv: string;
  diff: string;
  isDx: string;
}

// Helper to ensure songs have id field (mirrors the rest of the codebase)
const ensureIds = (songs: any[]): Song[] => {
  return songs.map((song, index) => ({
    ...song,
    id: song.id || `${song.title}-${song.diff}-${index}`,
    isDx: String(song.isDx),
  }));
};

// Shuffle array using Fisher-Yates (same algorithm used by /api/random)
const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Sanitize a pool name into a safe filename
const sanitizeFileName = (name: string): string => {
  const trimmed = name.trim().length > 0 ? name.trim() : `locked-random-${Date.now()}`;
  return trimmed.replace(/[\\/:*?"<>|]/g, "-");
};

// POST - Take N random (non-repeating) tracks from a given pool of songs
// and store them as a brand new, separate pool (JSON file under public/pools/).
//
// Body:
// {
//   songs: Song[],       // the source pool (e.g. currently selected pool)
//   count: number,       // N - how many tracks to randomly pick
//   poolName?: string,   // optional display/file name for the new pool
//   persist?: boolean    // optional, defaults to true - write the new pool to disk
// }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { songs, count, poolName, persist = true } = body || {};

    if (!Array.isArray(songs) || songs.length === 0) {
      return NextResponse.json(
        { error: "`songs` must be a non-empty array representing the current pool" },
        { status: 400 }
      );
    }

    const n = parseInt(count, 10);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json(
        { error: "`count` must be a positive integer (N)" },
        { status: 400 }
      );
    }

    const sourcePool = ensureIds(songs);
    const requestedCount = Math.min(n, sourcePool.length);

    // Randomly select N tracks from the current pool, without repeats,
    // into a brand new/separate pool.
    const shuffled = shuffleArray(sourcePool);
    const newPool = shuffled.slice(0, requestedCount);

    let filename: string | null = null;
    let filePath: string | null = null;

    if (persist) {
      const poolsDir = path.join(process.cwd(), "public", "pools");
      if (!fs.existsSync(poolsDir)) {
        fs.mkdirSync(poolsDir, { recursive: true });
      }

      filename = `${sanitizeFileName(poolName || "random-locked-pool")}.json`;
      filePath = path.join(poolsDir, filename);

      fs.writeFileSync(filePath, JSON.stringify(newPool, null, 2), "utf-8");
    }

    return NextResponse.json(
      {
        success: true,
        requestedCount: n,
        actualCount: newPool.length,
        sourcePoolSize: sourcePool.length,
        pool: newPool,
        filename,
        publicPath: filename ? `/pools/${filename}` : null,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error: any) {
    console.error("[RANDOM-LOCKED-SONG API] POST Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// OPTIONS - CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
