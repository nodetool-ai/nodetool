from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from nodetool.packages.registry import (
    Registry,
    PackageInfo,
    PackageModel,
    validate_repo_id,
)

from nodetool.api.utils import current_user
from nodetool.models.user import User

router = APIRouter(prefix="/api/packages", tags=["packages"])


# Models for API requests and responses
class PackageInstallRequest(BaseModel):
    repo_id: str = Field(description="Repository ID in the format <owner>/<project>")


class PackageResponse(BaseModel):
    success: bool
    message: str


class PackageListResponse(BaseModel):
    packages: List[PackageInfo]
    count: int


class InstalledPackageListResponse(BaseModel):
    packages: List[PackageModel]
    count: int


# Initialize registry
registry = Registry()


@router.get("/available", response_model=PackageListResponse)
async def list_available_packages(
    user: User = Depends(current_user),
) -> PackageListResponse:
    """List all available packages from the registry."""
    packages = registry.list_available_packages()
    return PackageListResponse(packages=packages, count=len(packages))


@router.get("/installed", response_model=InstalledPackageListResponse)
async def list_installed_packages(
    user: User = Depends(current_user),
) -> InstalledPackageListResponse:
    """List all installed packages."""
    packages = registry.list_installed_packages()
    return InstalledPackageListResponse(packages=packages, count=len(packages))


@router.post("/install", response_model=PackageResponse)
async def install_package(
    request: PackageInstallRequest, user: User = Depends(current_user)
) -> PackageResponse:
    """Install a package from the registry."""
    is_valid, error_msg = validate_repo_id(request.repo_id)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    try:
        registry.install_package(request.repo_id)
        return PackageResponse(
            success=True, message=f"Package {request.repo_id} installed successfully"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{repo_id}", response_model=PackageResponse)
async def uninstall_package(
    repo_id: str, user: User = Depends(current_user)
) -> PackageResponse:
    """Uninstall a package."""
    is_valid, error_msg = validate_repo_id(repo_id)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    success = registry.uninstall_package(repo_id)
    if success:
        return PackageResponse(
            success=True, message=f"Package {repo_id} uninstalled successfully"
        )
    else:
        raise HTTPException(
            status_code=404,
            detail=f"Package {repo_id} not found or could not be uninstalled",
        )


@router.post("/update", response_model=PackageResponse)
async def update_package(
    repo_id: str, user: User = Depends(current_user)
) -> PackageResponse:
    """Update an installed package."""
    is_valid, error_msg = validate_repo_id(repo_id)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    success = registry.update_package(repo_id)
    if success:
        return PackageResponse(
            success=True, message=f"Package {repo_id} updated successfully"
        )
    else:
        raise HTTPException(
            status_code=404,
            detail=f"Package {repo_id} not found or could not be updated",
        )
