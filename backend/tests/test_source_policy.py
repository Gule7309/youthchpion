import unittest

from app.evidence_harness.contracts import ContentType, SourceCandidate, SourceOwnerType
from app.evidence_harness.source_policy import SourcePolicy, SourcePolicyError


def candidate(**overrides):
    values = {
        "source_id": "s1",
        "title": "Employment Outlook",
        "url": "https://oecd.org/employment-outlook.pdf",
        "owner_type": SourceOwnerType.INTERNATIONAL_ORGANIZATION,
        "content_type": ContentType.INTERNATIONAL_REPORT,
        "publisher": "OECD",
    }
    values.update(overrides)
    return SourceCandidate(**values)


class SourcePolicyTests(unittest.TestCase):
    def test_news_is_rejected_even_if_labelled_as_research_institute(self):
        with self.assertRaisesRegex(SourcePolicyError, "news or media"):
            SourcePolicy().validate(candidate(url="https://news.bbc.com/story"))

    def test_unlisted_domain_is_rejected(self):
        with self.assertRaisesRegex(SourcePolicyError, "outside the authoritative allowlist"):
            SourcePolicy().validate(candidate(url="https://random-blog.example/post"))

    def test_company_survey_requires_approval_and_methodology(self):
        policy = SourcePolicy(approved_company_domains=frozenset({"example.com"}))
        with self.assertRaisesRegex(SourcePolicyError, "methodology"):
            policy.validate(
                candidate(
                    url="https://example.com/survey",
                    owner_type=SourceOwnerType.COMPANY,
                    content_type=ContentType.COMPANY_SURVEY,
                )
            )

    def test_approved_company_survey_is_allowed(self):
        policy = SourcePolicy(approved_company_domains=frozenset({"example.com"}))
        policy.validate(
            candidate(
                url="https://example.com/survey",
                owner_type=SourceOwnerType.COMPANY,
                content_type=ContentType.COMPANY_SURVEY,
                methodology_url="https://example.com/survey/methodology",
            )
        )


if __name__ == "__main__":
    unittest.main()
