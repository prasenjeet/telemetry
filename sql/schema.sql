-- Run once against the target database before starting the application.
-- Compatible with SQL Server 2016+ and Azure SQL.

CREATE TABLE telemetry_events (
    id              UNIQUEIDENTIFIER    NOT NULL  DEFAULT NEWID(),
    received_at     DATETIMEOFFSET(3)   NOT NULL  DEFAULT SYSDATETIMEOFFSET(),
    processed_at    DATETIMEOFFSET(3)   NULL,
    source          NVARCHAR(255)       NULL,
    event_type      NVARCHAR(100)       NULL,
    device_id       NVARCHAR(255)       NULL,
    session_id      NVARCHAR(255)       NULL,
    payload         NVARCHAR(MAX)       NOT NULL,

    CONSTRAINT PK_telemetry_events PRIMARY KEY CLUSTERED (id),
    INDEX IX_telemetry_received_at (received_at DESC),
    INDEX IX_telemetry_device_id   (device_id),
    INDEX IX_telemetry_event_type  (event_type)
);
