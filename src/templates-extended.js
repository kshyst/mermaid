export const extendedTemplates = [
  { name: 'Checkout and payment', type: 'Flowchart', description: 'Cart validation, inventory holds, payment retries, fulfillment and refunds.', code: `flowchart TD
    Start([Customer checks out]) --> Cart[Validate cart and prices]
    Cart --> Stock{All items available?}
    Stock -->|No| Adjust[Update cart and notify customer]
    Adjust --> Cart
    Stock -->|Yes| Hold[Reserve inventory]
    Hold --> Pay[Request payment]
    Pay --> Result{Payment outcome}
    Result -->|Declined| Retry{Try another method?}
    Retry -->|Yes| Pay
    Retry -->|No| Release[Release inventory]
    Release --> Cancel([Order cancelled])
    Result -->|Unknown| Reconcile[Query payment provider]
    Reconcile --> Result
    Result -->|Approved| Order[Confirm order]
    Order --> Fulfill[Pack and ship]
    Fulfill --> Delivered([Order delivered])
    Order -->|Fulfillment failed| Refund[Refund payment]
    Refund --> Release
    classDef success fill:#cffafe,stroke:#0891b2,color:#164e63
    classDef decision fill:#fef3c7,stroke:#d97706,color:#78350f
    class Order,Delivered success
    class Stock,Result,Retry decision` },
  { name: 'CI and deployment pipeline', type: 'Flowchart', description: 'Parallel quality gates, immutable images, staging and production rollback.', code: `flowchart LR
    Commit([Push commit]) --> Build[Install locked dependencies]
    Build --> Unit[Unit tests]
    Build --> Lint[Lint and type checks]
    Build --> Scan[Dependency scan]
    Unit --> Gate{All checks pass?}
    Lint --> Gate
    Scan --> Gate
    Gate -->|No| Fix[Fix and push again]
    Fix --> Commit
    Gate -->|Yes| Image[Build immutable image]
    Image --> Registry[(Image registry)]
    Registry --> Stage[Deploy to staging]
    Stage --> Smoke{Smoke checks pass?}
    Smoke -->|No| Investigate[Inspect logs and metrics]
    Investigate --> Fix
    Smoke -->|Yes| Approve[Approve production release]
    Approve --> Canary[Deploy canary]
    Canary --> Healthy{Error rate acceptable?}
    Healthy -->|Yes| Rollout[Complete rollout]
    Healthy -->|No| Rollback[Restore previous image]
    Rollout --> Done([Release complete])
    Rollback --> Investigate` },
  { name: 'Event-driven platform', type: 'Flowchart', description: 'An outbox, message broker, idempotent consumers, retries and dead letters.', code: `flowchart LR
    Client([Client]) --> API[Order API]
    subgraph Transaction[Single database transaction]
        API --> Orders[(Orders)]
        API --> Outbox[(Outbox events)]
    end
    Outbox --> Relay[Outbox relay]
    Relay --> Broker[(Message broker)]
    Broker --> Billing[Billing consumer]
    Broker --> Inventory[Inventory consumer]
    Broker --> Email[Notification consumer]
    Billing --> Dedup{Event already processed?}
    Dedup -->|Yes| Ack[Accept duplicate]
    Dedup -->|No| Process[Apply event and record ID]
    Process --> Outcome{Successful?}
    Outcome -->|Yes| Ack
    Outcome -->|Temporary failure| Retry[Retry with backoff]
    Retry --> Billing
    Outcome -->|Retry budget exhausted| DLQ[(Dead-letter queue)]
    DLQ --> Review[Operator review]
    Review -->|Replay| Broker
    Inventory --> Stock[(Stock ledger)]
    Email --> Provider[Email provider]` },
  { name: 'Incident response', type: 'Flowchart', description: 'Triage, escalation, containment, recovery checks and a postmortem.', code: `flowchart TD
    Alert([Monitoring alert]) --> Confirm[Confirm customer impact]
    Confirm --> Severity{Severity level}
    Severity -->|Critical| Page[Page incident commander]
    Severity -->|Minor| Ticket[Create investigation ticket]
    Page --> Channel[Open incident channel and timeline]
    Channel --> Mitigate[Reduce impact or roll back]
    Mitigate --> Stable{Service stable?}
    Stable -->|No| Escalate[Escalate to service owners]
    Escalate --> Mitigate
    Stable -->|Yes| Diagnose[Identify contributing causes]
    Ticket --> Diagnose
    Diagnose --> Fix[Implement and review fix]
    Fix --> Validate[Validate metrics and customer journeys]
    Validate --> Recovered{Recovery confirmed?}
    Recovered -->|No| Diagnose
    Recovered -->|Yes| Update[Send resolution update]
    Update --> Review[Write blameless postmortem]
    Review --> Actions[Assign prevention actions and owners]
    Actions --> Close([Incident closed])` },
  { name: 'OAuth authorization flow', type: 'Sequence', description: 'Authorization code with PKCE, consent, token exchange and API access.', code: `sequenceDiagram
    autonumber
    actor User
    participant Browser
    participant App as Client application
    participant Auth as Authorization server
    participant API as Resource API
    User->>App: Sign in
    App->>App: Generate state, verifier and challenge
    App->>Browser: Redirect with challenge and state
    Browser->>Auth: Authorization request
    Auth->>User: Authenticate and request consent
    User-->>Auth: Approve access
    Auth-->>Browser: Redirect with code and state
    Browser->>App: Callback with authorization code
    App->>App: Validate returned state
    App->>Auth: Exchange code plus verifier
    alt Code and verifier valid
        Auth-->>App: Access token and refresh token
        App->>API: Request with access token
        API-->>App: Authorized resource
        App-->>User: Show signed-in view
    else Invalid or expired code
        Auth-->>App: Reject token request
        App-->>User: Restart sign-in
    end
    Note over App,Auth: Verifier is never included in the authorization redirect` },
  { name: 'Resilient API call', type: 'Sequence', description: 'Cache hits, timeouts, bounded retries and a circuit breaker.', code: `sequenceDiagram
    autonumber
    actor User
    participant API
    participant Cache
    participant Breaker as Circuit breaker
    participant Provider as External provider
    User->>API: Request current quote
    API->>Cache: Read fresh quote
    alt Cache hit
        Cache-->>API: Fresh value
    else Cache miss
        Cache-->>API: No fresh value
        API->>Breaker: Check circuit status
        alt Circuit open
            Breaker-->>API: Reject external call
            API->>Cache: Read stale fallback
            Cache-->>API: Last known value
        else Circuit closed
            loop At most three attempts
                API->>Provider: Fetch quote with timeout
                Provider-->>API: Result or transient failure
                Note over API,Provider: Retry only transient failures with jitter
            end
            API->>Breaker: Record final outcome
            opt Successful response
                API->>Cache: Store quote with expiry
            end
        end
    end
    API-->>User: Quote with freshness indicator` },
  { name: 'Order fulfillment saga', type: 'Sequence', description: 'Coordinate inventory and payment with compensating operations.', code: `sequenceDiagram
    autonumber
    actor Customer
    participant Orders
    participant Inventory
    participant Payments
    participant Shipping
    Customer->>Orders: Place order with request ID
    Orders->>Inventory: Reserve items
    Inventory-->>Orders: Reservation created
    Orders->>Payments: Charge payment
    alt Payment approved
        Payments-->>Orders: Payment confirmed
        Orders->>Shipping: Schedule shipment
        alt Shipment scheduled
            Shipping-->>Orders: Tracking reference
            Orders-->>Customer: Order confirmed
        else Shipping unavailable
            Shipping-->>Orders: Cannot schedule shipment
            Orders->>Payments: Refund payment
            Payments-->>Orders: Refund confirmed
            Orders->>Inventory: Release reservation
            Orders-->>Customer: Order cancelled and refunded
        end
    else Payment declined
        Payments-->>Orders: Charge rejected
        Orders->>Inventory: Release reservation
        Orders-->>Customer: Choose another payment method
    end
    Note over Orders,Shipping: Every operation uses an idempotency key` },
  { name: 'Commerce database', type: 'Entity relationship', description: 'Customers, orders, order lines, products, payments and shipments.', code: `erDiagram
    CUSTOMER ||--o{ PURCHASE_ORDER : places
    PURCHASE_ORDER ||--|{ ORDER_ITEM : contains
    PRODUCT ||--o{ ORDER_ITEM : purchased_as
    PURCHASE_ORDER ||--o{ PAYMENT : paid_by
    PURCHASE_ORDER ||--o| SHIPMENT : fulfilled_by
    CUSTOMER {
        uuid id PK
        string email UK
        string full_name
        datetime created_at
    }
    PURCHASE_ORDER {
        uuid id PK
        uuid customer_id FK
        string status
        decimal total
        datetime placed_at
    }
    ORDER_ITEM {
        uuid id PK
        uuid order_id FK
        uuid product_id FK
        int quantity
        decimal unit_price
    }
    PRODUCT {
        uuid id PK
        string sku UK
        string name
        decimal price
    }
    PAYMENT {
        uuid id PK
        uuid order_id FK
        string provider_reference UK
        decimal amount
        string status
    }
    SHIPMENT {
        uuid id PK
        uuid order_id FK
        string tracking_number
        datetime shipped_at
    }` },
  { name: 'Learning platform database', type: 'Entity relationship', description: 'Course ownership, enrollments, lessons, quizzes and submissions.', code: `erDiagram
    INSTRUCTOR ||--o{ COURSE : teaches
    COURSE ||--|{ LESSON : includes
    STUDENT ||--o{ ENROLLMENT : registers
    COURSE ||--o{ ENROLLMENT : receives
    LESSON ||--o| QUIZ : assesses
    STUDENT ||--o{ SUBMISSION : sends
    QUIZ ||--o{ SUBMISSION : receives
    INSTRUCTOR {
        uuid id PK
        string name
        string email UK
    }
    COURSE {
        uuid id PK
        uuid instructor_id FK
        string title
        string status
    }
    LESSON {
        uuid id PK
        uuid course_id FK
        string title
        int position
    }
    STUDENT {
        uuid id PK
        string email UK
        string name
    }
    ENROLLMENT {
        uuid student_id PK,FK
        uuid course_id PK,FK
        datetime enrolled_at
        int progress_percent
    }
    QUIZ {
        uuid id PK
        uuid lesson_id FK
        int passing_score
    }
    SUBMISSION {
        uuid id PK
        uuid student_id FK
        uuid quiz_id FK
        int score
        datetime submitted_at
    }` },
  { name: 'Background job lifecycle', type: 'State', description: 'Queued jobs, concurrent execution states, retries and terminal outcomes.', code: `stateDiagram-v2
    [*] --> Queued
    Queued --> Running: Worker claims job
    Queued --> Cancelled: Cancel before execution
    state Running {
        [*] --> Preparing
        Preparing --> Executing: Inputs validated
        Executing --> Persisting: Task complete
        Persisting --> [*]: Results committed
    }
    Running --> Succeeded: Result committed
    Running --> RetryWaiting: Transient failure
    Running --> Failed: Permanent failure
    Running --> Cancelled: Cancellation acknowledged
    RetryWaiting --> Queued: Backoff elapsed
    RetryWaiting --> Failed: Attempts exhausted
    RetryWaiting --> Cancelled: User cancels
    Succeeded --> [*]
    Failed --> [*]
    Cancelled --> [*]
    note right of RetryWaiting
        Exponential backoff with jitter
        Maximum five attempts
    end note` },
  { name: 'Plugin architecture classes', type: 'Class', description: 'Interfaces, implementations, composition and a plugin registry.', code: `classDiagram
    class Plugin {
        <<interface>>
        +String id
        +initialize(Context context)
        +execute(Request request) Result
        +dispose()
    }
    class ExportPlugin {
        +String format
        +execute(Request request) Result
    }
    class ValidationPlugin {
        +List rules
        +execute(Request request) Result
    }
    class PluginRegistry {
        -Map plugins
        +register(Plugin plugin)
        +find(String id) Plugin
    }
    class Application {
        +start()
        +run(String pluginId)
    }
    class Context {
        +Logger logger
        +Map configuration
    }
    Plugin <|.. ExportPlugin
    Plugin <|.. ValidationPlugin
    PluginRegistry o-- Plugin : registers
    Application *-- PluginRegistry : owns
    Application *-- Context : provides
    Plugin ..> Context : uses` },
  { name: 'Platform migration schedule', type: 'Gantt', description: 'Discovery, parallel migration work, rehearsals, cutover and monitoring.', code: `gantt
    title Platform migration plan
    dateFormat YYYY-MM-DD
    excludes weekends
    section Preparation
    Inventory and dependencies :done, inventory, 2026-10-05, 5d
    Migration design :done, design, after inventory, 4d
    Backup and restore rehearsal :backup, after design, 3d
    section Implementation
    New environment :active, environment, after design, 7d
    Data migration scripts :scripts, after design, 8d
    Compatibility changes :compat, after design, 6d
    section Validation
    Integration checks :integration, after environment scripts compat, 4d
    Load and failover rehearsal :load, after integration, 3d
    Cutover approval :milestone, approval, after load backup, 0d
    section Rollout
    Maintenance window :crit, cutover, after approval, 1d
    Verify data and traffic :crit, verify, after cutover, 2d
    Monitor and tune :monitor, after verify, 5d
    Retire old environment :milestone, after monitor, 0d` },
  { name: 'System design discovery', type: 'Mind map', description: 'Requirements, components, data, reliability, security and operational decisions.', code: `mindmap
    root((System design))
        Requirements
            User journeys
            Latency targets
            Throughput and growth
            Consistency expectations
        Architecture
            API boundary
            Service ownership
            Sync versus async
            External dependencies
        Data
            Schema and indexes
            Retention policy
            Backups and restore
            Migration strategy
        Reliability
            Timeouts and retries
            Idempotency
            Failure isolation
            Recovery objectives
        Security
            Authentication
            Authorization
            Encryption
            Audit trail
        Operations
            Metrics and alerts
            Deployment strategy
            Incident runbooks
            Capacity planning` },
  { name: 'Product evolution timeline', type: 'Timeline', description: 'A staged product history with research, releases and expansion.', code: `timeline
    title Product evolution
    section Discovery
        January : Interview target users : Map primary workflows
        February : Test clickable prototype : Validate onboarding
    section First release
        March : Build core editor : Add source import and export
        April : Launch private beta : Collect usability feedback
        May : Add document persistence : Introduce templates
    section Expansion
        June : Add sharing controls : Improve accessibility
        July : Launch team workspaces : Add audit events
        August : Optimize large diagrams : Publish integrations
    section Scale
        September : Add reliability dashboards : Rehearse recovery
        October : Review adoption metrics : Plan next release` },
  { name: 'Git release workflow', type: 'Git graph', description: 'Feature development, release stabilization, a production hotfix and back-merges.', code: `gitGraph
    commit id: "initial"
    branch develop
    checkout develop
    commit id: "workspace"
    branch feature-templates
    checkout feature-templates
    commit id: "template-catalog"
    commit id: "template-tests"
    checkout develop
    merge feature-templates id: "merge-templates"
    branch release-v1
    checkout release-v1
    commit id: "release-checks"
    checkout main
    merge release-v1 id: "ship-v1" tag: "v1.0.0"
    branch hotfix
    checkout hotfix
    commit id: "http-id-fix" type: HIGHLIGHT
    checkout main
    merge hotfix id: "ship-hotfix" tag: "v1.0.1"
    checkout develop
    merge main id: "sync-production"
    commit id: "next-iteration"` },
  { name: 'Monthly revenue and target', type: 'XY chart', description: 'Compare monthly revenue bars against a target line with labeled axes.', code: `xychart-beta
    title "Monthly revenue and target"
    x-axis "Month" [Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec]
    y-axis "Revenue in thousands" 0 --> 180
    bar [42, 48, 61, 72, 86, 94, 108, 117, 126, 139, 153, 168]
    line [50, 55, 65, 75, 85, 95, 105, 115, 125, 135, 145, 160]` },
  { name: 'Feature prioritization matrix', type: 'Quadrant', description: 'Compare customer impact and implementation effort before planning a release.', code: `quadrantChart
    title Feature prioritization
    x-axis Low effort --> High effort
    y-axis Low impact --> High impact
    quadrant-1 Strategic investments
    quadrant-2 Quick wins
    quadrant-3 Small improvements
    quadrant-4 Reconsider
    Search improvements: [0.25, 0.80]
    Accessible shortcuts: [0.20, 0.65]
    Team permissions: [0.75, 0.85]
    Offline collaboration: [0.90, 0.70]
    Theme presets: [0.18, 0.25]
    Custom avatars: [0.35, 0.18]
    Legacy integration: [0.82, 0.28]
    Export reliability: [0.42, 0.90]` },
  { name: 'Energy distribution', type: 'Sankey', description: 'Track conserved energy flows from generation to sectors and transmission losses.', code: `sankey-beta

    Solar,Electricity grid,35
    Wind,Electricity grid,25
    Gas,Electricity grid,40
    Electricity grid,Residential,30
    Electricity grid,Industry,40
    Electricity grid,Transport,20
    Electricity grid,Transmission losses,10
    Residential,Useful energy,22
    Residential,End-use losses,8
    Industry,Useful energy,32
    Industry,End-use losses,8
    Transport,Useful energy,15
    Transport,End-use losses,5` },
  { name: 'Reliability requirements', type: 'Requirement', description: 'Trace reliability and retention requirements to implementation and verification.', code: `requirementDiagram
    requirement availability {
        id: REL_001
        text: Service availability must meet the agreed target
        risk: high
        verifymethod: test
    }
    requirement recovery {
        id: REL_002
        text: Backups must support a tested recovery procedure
        risk: high
        verifymethod: demonstration
    }
    requirement retention {
        id: DATA_001
        text: Deactivated diagrams must retain their source
        risk: medium
        verifymethod: inspection
    }
    element database {
        type: software
        docref: persistence_design
    }
    element recovery_checks {
        type: test_suite
        docref: recovery_runbook
    }
    database - satisfies -> retention
    database - satisfies -> availability
    recovery_checks - verifies -> recovery
    recovery_checks - verifies -> retention
    availability - derives -> recovery` },
  { name: 'Application deployment blocks', type: 'Block', description: 'A layered deployment with edge, application services and storage.', code: `block-beta
    columns 3
    Client["Browser"]:3
    space:3
    Edge["Nginx and authentication"]:3
    space:3
    Frontend["Static frontend"] API["Diagram API"] Worker["Background worker"]
    space:3
    Assets["Bundled assets"] SQLite[("SQLite database")] Queue["Job queue"]
    Client --> Edge
    Edge --> Frontend
    Edge --> API
    Frontend --> Assets
    API --> SQLite
    API --> Queue
    Queue --> Worker
    Worker --> SQLite
    style Edge fill:#cffafe,stroke:#0891b2,color:#164e63
    style SQLite fill:#dcfce7,stroke:#16a34a,color:#14532d` },
];
