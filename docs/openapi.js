// backend/src/docs/openapi.js
const path = require("path");
const swaggerJsdoc = require("swagger-jsdoc");

const API_BASE = process.env.API_PUBLIC_URL || "/api";
const VERSION  = process.env.APP_VERSION || "0.1.0";

const spec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "myjournal API",
      version: VERSION,
      description:
        "Personal journaling + news reading API (articles, digests, journals, notes, calendar, AI helpers).",
      contact: { name: "myjournal", url: "https://example.com" }
    },
    servers: [{ url: API_BASE }],
    tags: [
      { name: "auth", description: "Sign up, login, and current user" },
      { name: "ai", description: "AI helpers (summaries, prompts)" },
      { name: "articles", description: "Save, refresh, parse, and read articles" },
      { name: "digests", description: "Daily brief generation" },
      { name: "journals", description: "User-authored long-form posts" },
      { name: "notes", description: "Short notes / personal memos" },
      { name: "calendar", description: "Events + AI day plans" },
      { name: "misc", description: "Health and misc endpoints" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        Error: {
          type: "object",
          properties: { error: { type: "string" } }
        },

        AuthResponse: {
          type: "object",
          properties: {
            token: { type: "string", description: "JWT bearer token" }
          },
          example: { token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
        },

        Article: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            url: { type: "string" },
            host: { type: "string" },
            byline: { type: "string" },
            readingMins: { type: "integer" },
            excerpt: { type: "string" },
            contentHTML: { type: "string" },
            imageUrl: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            source: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            lastSeenAt: { type: "string", format: "date-time" },
          }
        },
        ListArticlesResponse: {
          type: "object",
          properties: {
            items: { type: "array", items: { $ref: "#/components/schemas/Article" } },
            page: { type: "integer" },
            total: { type: "integer" }
          }
        },

        DigestItem: {
          type: "object",
          properties: {
            articleId: { type: "string", nullable: true },
            url: { type: "string" },
            title: { type: "string" },
            summary: { type: "string" },
            source: { type: "string" },
            readingMins: { type: "integer" },
            category: { type: "string", enum: ["top", "emerging", "long"] },
            rank: { type: "integer" },
          }
        },
        Digest: {
          type: "object",
          properties: {
            id: { type: "string" },
            date: { type: "string", example: "2025-08-14" },
            tldr: { type: "string" },
            topics: { type: "array", items: { type: "string" } },
            sources: { type: "array", items: { type: "string" } },
            stats: {
              type: "object",
              properties: {
                totalItems: { type: "integer" },
                longReads: { type: "integer" },
                newCount: { type: "integer" }
              }
            },
            items: { type: "array", items: { $ref: "#/components/schemas/DigestItem" } },
            generatedAt: { type: "string", format: "date-time" },
          }
        },

        Journal: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            body: { type: "string" },
            excerpt: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            date: { type: "string", example: "2025-08-14" },
            slug: { type: "string", nullable: true },
            coverUrl: { type: "string" },
            authorDisplay: { type: "string" },
            visibility: { type: "string", enum: ["private", "public"] },
            publishedAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          }
        },
        ListJournalsResponse: {
          type: "object",
          properties: {
            items: { type: "array", items: { $ref: "#/components/schemas/Journal" } },
            page: { type: "integer" },
            total: { type: "integer" }
          }
        },

        Note: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            body: { type: "string" },
            date: { type: "string", example: "2025-08-14" },
            done: { type: "boolean" },
            pinned: { type: "boolean" },
            tags: { type: "array", items: { type: "string" } },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          }
        },
        NoteDaily: {
          type: "object",
          properties: {
            id: { type: "string" },
            date: { type: "string" },
            summary: { type: "string" },
            bullets: { type: "array", items: { type: "string" } },
            generatedAt: { type: "string", format: "date-time" },
          }
        },
        ListNotesResponse: {
          type: "object",
          properties: {
            items: { type: "array", items: { $ref: "#/components/schemas/Note" } },
            page: { type: "integer" },
            total: { type: "integer" }
          }
        },

        CalendarEvent: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            date: { type: "string", example: "2025-08-14" },
            startTime: { type: "string", example: "09:00" },
            endTime: { type: "string", example: "10:30" },
            allDay: { type: "boolean" },
            location: { type: "string" },
            description: { type: "string" },
            color: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          }
        },
        CalendarDaily: {
          type: "object",
          properties: {
            id: { type: "string" },
            date: { type: "string" },
            summary: { type: "string" },
            agenda: { type: "array", items: { type: "string" } },
            generatedAt: { type: "string", format: "date-time" },
          }
        },
        ListCalendarResponse: {
          type: "object",
          properties: {
            items: { type: "array", items: { $ref: "#/components/schemas/CalendarEvent" } }
          }
        },

        AISummaryResponse: {
          type: "object",
          properties: {
            summary: { type: "string" },
            mode: { type: "string", enum: ["tldr", "detailed", "outline"] }
          }
        }
      },
      parameters: {
        PageParam: { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        LimitParam: { name: "limit", in: "query", schema: { type: "integer", default: 30 } },
        QParam: { name: "q", in: "query", schema: { type: "string" } },
        TagParam: { name: "tag", in: "query", schema: { type: "string" } },
      }
    },
  },
  // 👇 non-empty — satisfies swagger-jsdoc even if we define paths programmatically
  apis: [
    path.join(__dirname, "../routes/**/*.js"),
    path.join(__dirname, "../controllers/**/*.js"),
    path.join(__dirname, "../models/**/*.js"),
  ],
});

// ------------------------- PATHS -------------------------
spec.paths = {
  "/health": {
    get: {
      tags: ["misc"],
      summary: "Health check",
      responses: {
        200: {
          description: "OK",
          content: {
            "application/json": {
              schema: { type: "object", properties: { ok: { type: "boolean" }, env: { type: "string" } } },
              example: { ok: true, env: "development" }
            }
          }
        }
      }
    }
  },

  // -------------------- AUTH --------------------
  "/auth/signup": {
    post: {
      tags: ["auth"],
      summary: "Sign up",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", required: ["email", "password"], properties: {
              name: { type: "string" }, email: { type: "string" }, password: { type: "string" }
            }},
            example: { name: "Mike", email: "mike@example.com", password: "pass1234" }
          }
        }
      },
      responses: {
        201: { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } } },
        400: { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
      }
    }
  },
  "/auth/login": {
    post: {
      tags: ["auth"],
      summary: "Log in",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", required: ["email", "password"], properties: {
              email: { type: "string" }, password: { type: "string" }
            }},
            example: { email: "mike@example.com", password: "pass1234" }
          }
        }
      },
      responses: {
        200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } } },
        401: { description: "Invalid credentials" }
      }
    }
  },
  "/auth/me": {
    get: {
      tags: ["auth"], summary: "Current user",
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: "OK", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
        401: { description: "Unauthorized" }
      }
    }
  },

  // ---------------------- AI ----------------------
  "/ai/summarize": {
    post: {
      tags: ["ai"],
      summary: "Summarize text or saved article",
      description: "If `articleId` is given, the server loads the saved content; otherwise summarize `text`.",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", properties: {
              text: { type: "string" },
              articleId: { type: "string" },
              mode: { type: "string", enum: ["tldr", "detailed", "outline"], default: "tldr" }
            }},
            examples: {
              textTLDR: { value: { text: "Long article text here...", mode: "tldr" } },
              withId: { value: { articleId: "66b..." , mode: "detailed" } }
            }
          }
        }
      },
      responses: {
        200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/AISummaryResponse" } } } },
        401: { description: "Unauthorized" }
      }
    }
  },

  // ------------------- ARTICLES -------------------
  "/articles": {
    get: {
      tags: ["articles"],
      summary: "List saved articles",
      security: [{ bearerAuth: [] }],
      parameters: [
        { $ref: "#/components/parameters/PageParam" },
        { $ref: "#/components/parameters/LimitParam" },
        { $ref: "#/components/parameters/QParam" },
        { $ref: "#/components/parameters/TagParam" },
      ],
      responses: {
        200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/ListArticlesResponse" } } } },
        401: { description: "Unauthorized" }
      }
    }
  },
  "/articles/import": {
    post: {
      tags: ["articles"],
      summary: "Import one article by URL",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { "application/json": {
          schema: { type: "object", required: ["url"], properties: {
            url: { type: "string" }, tags: { type: "array", items: { type: "string" } }
          }},
          example: { url: "https://example.com/story", tags: ["tech"] }
        } }
      },
      responses: {
        201: { description: "Created", content: { "application/json": { schema: { type: "object", properties: { item: { $ref: "#/components/schemas/Article" } } } } } },
        401: { description: "Unauthorized" },
        400: { description: "Parse failed or invalid URL" }
      }
    }
  },
  "/articles/refresh": {
    post: {
      tags: ["articles"],
      summary: "Refresh from feeds/APIs and upsert",
      description: "Supports topic filters; uses multiple sources (NewsAPI/GNews, RSS).",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "limit", in: "query", schema: { type: "integer", default: 48 } },
        { name: "force", in: "query", schema: { type: "boolean", default: true } },
        { name: "topics", in: "query", schema: { type: "string", example: "world,business,tech,science" } },
      ],
      responses: {
        201: { description: "Imported/updated", content: { "application/json": { schema: { type: "object", properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/Article" } },
          imported: { type: "integer" }, updated: { type: "integer" }, seen: { type: "integer" },
          topics: { type: "string", nullable: true }
        } } } } },
        401: { description: "Unauthorized" }
      }
    }
  },
  "/articles/{id}": {
    get: {
      tags: ["articles"], security: [{ bearerAuth: [] }],
      summary: "Get one article",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { item: { $ref: "#/components/schemas/Article" } } } } } },
        401: { description: "Unauthorized" },
        404: { description: "Not found" }
      }
    },
    put: {
      tags: ["articles"], security: [{ bearerAuth: [] }],
      summary: "Update article (title/tags, optional reparse)",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: { content: { "application/json": {
        schema: { type: "object", properties: { title: { type: "string" }, tags: { type: "array", items: { type: "string" } }, reparse: { type: "boolean" } } },
        example: { title: "New title", tags: ["longread","bbc"], reparse: false }
      }}},
      responses: {
        200: { description: "OK" }, 401: { description: "Unauthorized" }, 404: { description: "Not found" }
      }
    },
    delete: {
      tags: ["articles"], security: [{ bearerAuth: [] }],
      summary: "Delete article",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 401: { description: "Unauthorized" }, 404: { description: "Not found" } }
    }
  },

  // ------------------- DIGESTS -------------------
  "/digests/generate": {
    post: {
      tags: ["digests"],
      summary: "Generate (or regenerate) daily digest",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "date", in: "query", schema: { type: "string", example: "2025-08-14" } },
        { name: "limit", in: "query", schema: { type: "integer", default: 12 } },
        { name: "refresh", in: "query", schema: { type: "boolean", default: false } },
        { name: "length", in: "query", schema: { type: "string", enum: ["tldr","detailed"], default: "detailed" } },
      ],
      responses: {
        201: { description: "Created", content: { "application/json": { schema: { type: "object", properties: { item: { $ref: "#/components/schemas/Digest" } } } } } },
        401: { description: "Unauthorized" }
      }
    }
  },
  "/digests/{date}": {
    get: {
      tags: ["digests"], security: [{ bearerAuth: [] }],
      summary: "Get digest by date",
      parameters: [{ name: "date", in: "path", required: true, schema: { type: "string", example: "2025-08-14" } }],
      responses: {
        200: { description: "OK (item may be null)", content: { "application/json": { schema: { type: "object", properties: { item: { anyOf: [{ $ref: "#/components/schemas/Digest" }, { type: "null" }] } } } } } },
        401: { description: "Unauthorized" }
      }
    }
  },

  // ------------------- JOURNALS -------------------
  "/journals/public": {
    get: {
      tags: ["journals"],
      summary: "Public feed (pressroom)",
      parameters: [
        { $ref: "#/components/parameters/PageParam" },
        { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        { $ref: "#/components/parameters/QParam" },
        { name: "tag", in: "query", schema: { type: "string" } },
      ],
      responses: {
        200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/ListJournalsResponse" } } } }
      }
    }
  },
  "/journals/public/{slug}": {
    get: {
      tags: ["journals"],
      summary: "Public article by slug",
      parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { item: { $ref: "#/components/schemas/Journal" } } } } } },
        404: { description: "Not found" }
      }
    }
  },
  "/journals": {
    get: {
      tags: ["journals"], security: [{ bearerAuth: [] }],
      summary: "List my journals",
      parameters: [
        { $ref: "#/components/parameters/PageParam" },
        { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        { $ref: "#/components/parameters/QParam" },
      ],
      responses: {
        200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/ListJournalsResponse" } } } },
        401: { description: "Unauthorized" }
      }
    },
    post: {
      tags: ["journals"], security: [{ bearerAuth: [] }],
      summary: "Create journal (draft or public)",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: {
        title: { type: "string" }, body: { type: "string" }, tags: { type: "array", items: { type: "string" } },
        date: { type: "string" }, visibility: { type: "string", enum: ["private","public"] },
        coverUrl: { type: "string" }, authorDisplay: { type: "string" }
      }}, example: { title: "Hello", body: "Long text...", tags: ["opinion"], visibility: "public" } } } },
      responses: {
        201: { description: "Created", content: { "application/json": { schema: { type: "object", properties: { item: { $ref: "#/components/schemas/Journal" } } } } } },
        401: { description: "Unauthorized" }
      }
    }
  },
  "/journals/{id}": {
    get: {
      tags: ["journals"], security: [{ bearerAuth: [] }],
      summary: "Get my journal",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 401: { description: "Unauthorized" }, 404: { description: "Not found" } }
    },
    put: {
      tags: ["journals"], security: [{ bearerAuth: [] }],
      summary: "Update my journal",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: { content: { "application/json": { schema: { type: "object", additionalProperties: true }, example: { title: "Edited title" } } } },
      responses: { 200: { description: "OK" }, 401: { description: "Unauthorized" }, 404: { description: "Not found" } }
    },
    delete: {
      tags: ["journals"], security: [{ bearerAuth: [] }],
      summary: "Delete my journal",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 401: { description: "Unauthorized" }, 404: { description: "Not found" } }
    }
  },
  "/journals/{id}/publish": {
    post: {
      tags: ["journals"], security: [{ bearerAuth: [] }],
      summary: "Publish my journal",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 401: { description: "Unauthorized" }, 404: { description: "Not found" } }
    }
  },
  "/journals/{id}/unpublish": {
    post: {
      tags: ["journals"], security: [{ bearerAuth: [] }],
      summary: "Unpublish my journal",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 401: { description: "Unauthorized" }, 404: { description: "Not found" } }
    }
  },

  // --------------------- NOTES ---------------------
  "/notes": {
    get: {
      tags: ["notes"], security: [{ bearerAuth: [] }],
      summary: "List notes (optionally by date)",
      parameters: [
        { name: "date", in: "query", schema: { type: "string", example: "2025-08-14" } },
        { $ref: "#/components/parameters/PageParam" },
        { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
        { $ref: "#/components/parameters/QParam" },
      ],
      responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/ListNotesResponse" } } } } }
    },
    post: {
      tags: ["notes"], security: [{ bearerAuth: [] }],
      summary: "Create note",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: {
        title: { type: "string" }, body: { type: "string" }, date: { type: "string" },
        tags: { type: "array", items: { type: "string" } }, done: { type: "boolean" }, pinned: { type: "boolean" }
      }}, example: { title: "Buy milk", body: "2% milk", done: false } } } },
      responses: { 201: { description: "Created", content: { "application/json": { schema: { type: "object", properties: { item: { $ref: "#/components/schemas/Note" } } } } } } }
    }
  },
  "/notes/{id}": {
    get:  { tags:["notes"], security:[{bearerAuth:[]}], summary:"Get one",  parameters:[{name:"id",in:"path",required:true,schema:{type:"string"}}], responses:{200:{description:"OK"},404:{description:"Not found"}} },
    put:  { tags:["notes"], security:[{bearerAuth:[]}], summary:"Update",   parameters:[{name:"id",in:"path",required:true,schema:{type:"string"}}], requestBody:{content:{"application/json":{schema:{type:"object",additionalProperties:true},example:{done:true}}}}, responses:{200:{description:"OK"}} },
    delete:{tags:["notes"], security:[{bearerAuth:[]}], summary:"Delete",   parameters:[{name:"id",in:"path",required:true,schema:{type:"string"}}], responses:{200:{description:"OK"},404:{description:"Not found"}} },
  },
  "/notes/daily/{date}": {
    get: {
      tags: ["notes"], security: [{ bearerAuth: [] }],
      summary: "Get daily AI summary",
      parameters: [{ name: "date", in: "path", required: true, schema: { type: "string", example: "2025-08-14" } }],
      responses: {
        200: { description:"OK (item may be null)", content: { "application/json": { schema: { type:"object", properties: { item: { anyOf:[{ $ref:"#/components/schemas/NoteDaily" }, { type:"null" }] } } } } } }
      }
    }
  },
  "/notes/daily/{date}/generate": {
    post: {
      tags: ["notes"], security: [{ bearerAuth: [] }],
      summary: "Generate today's note summary (bullets)",
      parameters: [{ name:"date", in:"path", required:true, schema:{ type:"string", example: "2025-08-14" } }],
      responses: {
        201: { description:"Created/updated", content: { "application/json": { schema: { type:"object", properties: { item: { $ref:"#/components/schemas/NoteDaily" }, nothingToDo: { type:"boolean" } } } } } }
      }
    }
  },

  // -------------------- CALENDAR --------------------
  "/calendar": {
    get: {
      tags: ["calendar"], security: [{ bearerAuth: [] }],
      summary: "List events in range",
      parameters: [
        { name: "start", in: "query", required: true, schema: { type: "string", example: "2025-08-01" } },
        { name: "end",   in: "query", required: true, schema: { type: "string", example: "2025-08-31" } },
        { $ref: "#/components/parameters/QParam" },
      ],
      responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/ListCalendarResponse" } } } } }
    },
    post: {
      tags: ["calendar"], security: [{ bearerAuth: [] }],
      summary: "Create event",
      requestBody: { required: true, content: { "application/json": { schema: { $ref:"#/components/schemas/CalendarEvent" } } } },
      responses: { 201: { description:"Created", content: { "application/json": { schema: { type:"object", properties: { item: { $ref:"#/components/schemas/CalendarEvent" } } } } } } }
    }
  },
  "/calendar/{id}": {
    get: { tags:["calendar"], security:[{bearerAuth:[]}], summary:"Get one", parameters:[{name:"id",in:"path",required:true,schema:{type:"string"}}], responses:{200:{description:"OK"},404:{description:"Not found"}} },
    put: { tags:["calendar"], security:[{bearerAuth:[]}], summary:"Update",  parameters:[{name:"id",in:"path",required:true,schema:{type:"string"}}], requestBody:{content:{"application/json":{schema:{type:"object",additionalProperties:true},example:{title:"Meet Tom"}}}}, responses:{200:{description:"OK"}} },
    delete:{tags:["calendar"],security:[{bearerAuth:[]}],summary:"Delete",  parameters:[{name:"id",in:"path",required:true,schema:{type:"string"}}], responses:{200:{description:"OK"},404:{description:"Not found"}} },
  },
  "/calendar/daily/{date}": {
    get: {
      tags: ["calendar"], security: [{ bearerAuth: [] }],
      summary: "Get AI day plan",
      parameters: [{ name:"date", in:"path", required:true, schema:{ type:"string", example: "2025-08-14" } }],
      responses: {
        200: { description:"OK (item may be null)", content: { "application/json": { schema: { type:"object", properties: { item: { anyOf:[{ $ref:"#/components/schemas/CalendarDaily" }, { type:"null" }] } } } } } }
      }
    }
  },
  "/calendar/daily/{date}/generate": {
    post: {
      tags: ["calendar"], security: [{ bearerAuth: [] }],
      summary: "Generate AI day plan",
      parameters: [{ name:"date", in:"path", required:true, schema:{ type:"string", example: "2025-08-14" } }],
      responses: {
        201: { description:"Created/updated", content: { "application/json": { schema: { type:"object", properties: { item: { $ref:"#/components/schemas/CalendarDaily" }, nothingToDo:{ type:"boolean" } } } } } }
      }
    }
  },
};

// ensure we always have something in spec even if no JSDoc comments are found
spec.tags = spec.tags || [];

module.exports = { spec };
