import { extendedTemplates } from './templates-extended';
export const templates = [
  { name: 'Product launch', type: 'Flowchart', description: 'From a spark of an idea to something real.', code: `flowchart TD
    A([A new idea]) --> B[Research & discovery]
    B --> C{Worth building?}
    C -->|Yes| D[Design a prototype]
    C -->|Not yet| B
    D --> E[Build & iterate]
    E --> F{Ready to launch?}
    F -->|Refine| D
    F -->|Ship it| G([Launch day 🚀])

    style A fill:#ede9fe,stroke:#8b5cf6,color:#5b21b6
    style G fill:#dcfce7,stroke:#22c55e,color:#166534
    style C fill:#fef3c7,stroke:#f59e0b,color:#92400e
    style F fill:#fef3c7,stroke:#f59e0b,color:#92400e` },
  { name: 'API request', type: 'Sequence', description: 'Follow a request through your system.', code: `sequenceDiagram
    autonumber
    actor User
    participant App
    participant API
    participant DB as Database
    User->>App: Open dashboard
    App->>API: GET /projects
    API->>DB: Query projects
    DB-->>API: Results
    API-->>App: 200 OK
    App-->>User: Show projects
    Note over App,API: Secure authenticated request` },
  { name: 'Data model', type: 'Entity relationship', description: 'Map the relationships in your database.', code: `erDiagram
    USER ||--o{ PROJECT : owns
    PROJECT ||--o{ DIAGRAM : contains
    USER ||--o{ COMMENT : writes
    DIAGRAM ||--o{ COMMENT : receives
    USER {
        int id PK
        string name
        string email
    }
    PROJECT {
        int id PK
        string title
    }
    DIAGRAM {
        int id PK
        string source
        datetime updated_at
    }
    COMMENT {
        int id PK
        int user_id FK
        int diagram_id FK
        string body
        datetime created_at
    }` },
  { name: 'Release roadmap', type: 'Gantt', description: 'Bring milestones and timelines together.', code: `gantt
    title Release roadmap
    dateFormat YYYY-MM-DD
    section Discovery
    Research :done, research, 2026-10-01, 5d
    Design :active, design, after research, 7d
    section Delivery
    Development :dev, after design, 12d
    Quality review :review, after dev, 4d
    Launch :milestone, after review, 0d` },
  { name: 'Order lifecycle', type: 'State', description: 'Describe transitions and system behavior.', code: `stateDiagram-v2
    [*] --> Draft
    Draft --> Submitted: Submit order
    Submitted --> Paid: Payment confirmed
    Submitted --> Cancelled: Cancel
    Paid --> Shipped: Dispatch
    Shipped --> Delivered: Receive
    Delivered --> [*]
    Cancelled --> [*]` },
  { name: 'Team structure', type: 'Mind map', description: 'Organize ideas into an intuitive hierarchy.', code: `mindmap
    root((Our team))
        Product
            Research
            Design
        Engineering
            Frontend
            Backend
            Platform
        Growth
            Marketing
            Community` },
  { name: 'Traffic sources', type: 'Pie', description: 'Make proportions easy to understand.', code: `pie showData
    title Traffic sources
    "Organic search" : 42
    "Direct" : 28
    "Social" : 18
    "Referral" : 12` },
  { name: 'Service architecture', type: 'Flowchart', description: 'Visualize the pieces of your platform.', code: `flowchart LR
    U([Users]) --> CDN[CDN]
    CDN --> WEB[Web app]
    WEB --> API[API gateway]
    subgraph Services
        API --> AUTH[Auth service]
        API --> CORE[Core service]
        CORE --> Q[Job queue]
        Q --> W[Workers]
    end
    CORE --> DB[(Database)]
    AUTH --> CACHE[(Cache)]
    W --> DB` },
  { name: 'Domain classes', type: 'Class', description: 'Define objects and their relationships.', code: `classDiagram
    class Project {
        +String name
        +addDiagram()
        +archive()
    }
    class Diagram {
        +String source
        +render()
        +export()
    }
    class User {
        +String email
        +createProject()
    }
    User "1" --> "many" Project : owns
    Project "1" *-- "many" Diagram : contains` },
  { name: 'Customer experience', type: 'Journey', description: 'Explore the moments that matter.', code: `journey
    title A customer's first visit
    section Discover
      Find our website: 4: Customer
      Explore features: 5: Customer
    section Try
      Create a diagram: 5: Customer
      Export a diagram: 4: Customer
    section Return
      Share with team: 5: Customer, Team` },
  ...extendedTemplates,
];
export const blankCode = 'flowchart TD\n    A[Start here] --> B[Your next idea]\n';
