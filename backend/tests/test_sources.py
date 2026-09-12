from __future__ import annotations

from datetime import date
from io import BytesIO

from openpyxl import Workbook

from app.sources.dgbas import EXPECTED_ENGLISH, ROW_MAP, parse_dgbas_workbook
from app.sources.ilo import parse_ilo_csv
from app.sources.taiwanjobs import parse_taiwanjobs_xml


def test_dgbas_parser_extracts_20_to_29_and_converts_thousands() -> None:
    workbook = Workbook()
    sheet = workbook.active
    for row in ROW_MAP:
        sheet.cell(row, 2, EXPECTED_ENGLISH[row])
        sheet.cell(row, 3, 100)
        sheet.cell(row, 15, 3)
        sheet.cell(row, 17, 4)
    body = BytesIO()
    workbook.save(body)

    records = parse_dgbas_workbook(body.getvalue())

    assert len(records) == 7
    assert records[0]["youth_employed"] == 3000
    assert records[0]["youth_employed_20_24"] == 3000
    assert records[0]["youth_employed_25_29"] == 4000
    assert records[0]["youth_employed_20_29"] == 7000
    assert records[0]["total_employed"] == 100000


def test_dgbas_parser_fails_closed_on_schema_drift() -> None:
    workbook = Workbook()
    body = BytesIO()
    workbook.save(body)

    try:
        parse_dgbas_workbook(body.getvalue())
    except ValueError as exc:
        assert "schema drift" in str(exc)
    else:
        raise AssertionError("schema drift must fail")


def test_ilo_parser_aggregates_detailed_occupations() -> None:
    body = (
        b"Major groups,Job title,Average score,mean_exposure_level,Standard deviation\n"
        b"4 - Clerical,Clerk,0.7,Gradient 4,0.1\n"
        b"4 - Clerical,Secretary,0.5,Gradient 3,0.1\n"
        b"2 - Professionals,Engineer,0.2,Gradient 1,0.1\n"
    )

    records = parse_ilo_csv(body)

    clerical = next(item for item in records if item["code"] == "4")
    assert clerical["exposure_score"] == 0.6
    assert clerical["occupation_count"] == 2


def test_taiwanjobs_parser_repairs_tags_filters_and_audits() -> None:
    xml = """<?xml version='1.0'?><DataList>
    <Data><OCCU_DESC（職務名稱）>AI 行政助理</OCCU_DESC（職務名稱）>
    <CJOB_NAME1（類別）>行政</CJOB_NAME1（類別）>
    <JOB_DETAIL（內容）>使用生成式 AI</JOB_DETAIL（內容）>
    <URL_QUERY（網址）>https://example.com/a</URL_QUERY（網址）><EXPERIENCE（經驗）>無</EXPERIENCE（經驗）>
    <JOB_PERSON（人數）>2</JOB_PERSON（人數）><STOP_DATE（截止）>額滿為止</STOP_DATE（截止）></Data>
    <Data><OCCU_DESC（職務名稱）>過期客服</OCCU_DESC（職務名稱）>
    <CJOB_NAME1（類別）>客服</CJOB_NAME1（類別）><URL_QUERY（網址）>https://example.com/b</URL_QUERY（網址）>
    <STOP_DATE（截止）>20200101</STOP_DATE（截止）></Data></DataList>"""

    records, audit = parse_taiwanjobs_xml(xml.encode(), today=date(2026, 9, 12))

    assert len(records) == 1
    assert records[0]["occupation_code"] == "4"
    assert records[0]["ai_related"] is True
    assert records[0]["headcount"] == 2
    assert audit["expired_removed"] == 1
    assert audit["schema_repairs"]
