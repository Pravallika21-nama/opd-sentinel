"""Shared field names. Hidden labels are never model inputs."""

NUMERIC_FIELDS: tuple[str, ...] = (
    "age",
    "systolic_bp",
    "diastolic_bp",
    "pulse",
    "temperature_c",
    "spo2",
)

TEXT_FIELDS: tuple[str, ...] = (
    "complaint",
    "known_conditions",
    "medications",
    "sex",
)

LABEL_FIELDS: tuple[str, ...] = ("triage_level", "department", "emergency")

ID_FIELD = "case_id"

SOURCE_FIELD = "record_source"

INTAKE_FIELDS: tuple[str, ...] = (
    "age",
    "sex",
    "systolic_bp",
    "diastolic_bp",
    "pulse",
    "temperature_c",
    "spo2",
    "complaint",
    "known_conditions",
    "medications",
)
