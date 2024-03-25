import boto3
from typing import Optional
import logging
from botocore.client import Config


def _patch_headers(request, **kwargs):
    # https://github.com/boto/boto/issues/840
    request.headers.pop("Expect", None)


class AWSClient:
    """
    A client for interacting with AWS services.

    Main concern of the client is session and token management.
    """

    region_name: str | None
    endpoint_url: str | None
    access_key_id: str | None
    secret_access_key: str | None
    session_token: str | None
    log: logging.Logger | None

    def __init__(
        self,
        region_name: str | None,
        endpoint_url: str | None = None,
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
        session_token: str | None = None,
        log: logging.Logger | None = None,
    ):
        self.region_name = region_name
        self.endpoint_url = endpoint_url
        self.access_key_id = access_key_id
        self.secret_access_key = secret_access_key
        self.session_token = session_token
        if log is None:
            log = logging.getLogger(__name__)
            log.setLevel(logging.INFO)
            log.addHandler(logging.StreamHandler())
        self.log = log

    def get_role(self):
        """
        Get the current IAM role.
        """
        return self.client("sts").get_caller_identity()["Arn"]

    def assume_role(
        self,
        role_arn: str,
        session_name="AssumeRoleSession1",
    ):
        """
        Assume a role in AWS. This is useful for running code locally, but
        accessing AWS resources as if you were in AWS.
        """
        credentials = self.client("sts").assume_role(
            RoleArn=role_arn, RoleSessionName=session_name, DurationSeconds=3600 * 8
        )["Credentials"]

        print("Using these credentials going forward:", credentials)

        self.access_key_id = credentials["AccessKeyId"]
        self.secret_access_key = credentials["SecretAccessKey"]
        self.session_token = credentials["SessionToken"]

    def session(self):
        """
        Return a boto3 session.

        If we have temporary credentials, use them. Otherwise,
        rely on boto3 to find credentials in the environment.
        """
        return boto3.session.Session(  # type: ignore
            region_name=self.region_name,
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
            aws_session_token=self.session_token,
        )

    def client(self, service_name: str, **kwargs):
        """
        Creates a boto3 client for the given service.

        Args:
            service_name: The name of the service.
            kwargs: Additional arguments to pass to the client.
        """
        client = self.session().client(
            service_name, endpoint_url=self.endpoint_url, **kwargs  # type: ignore
        )
        client.meta.events.register("before-send.s3.*", _patch_headers)
        return client

    def get_s3_service(self, bucket: str):
        """
        Create an S3 service for the given bucket.

        Args:
            bucket: The name of the bucket.
        """
        from nodetool.storage.s3_storage import S3Storage

        assert self.log is not None

        return S3Storage(
            bucket_name=bucket,
            client=self.client("s3", config=Config(signature_version="s3v4")),
            log=self.log,
            endpoint_url=self.endpoint_url,
        )
