# nodetool.api.package

## InstalledPackageListResponse

**Fields:**
- **packages** (typing.List[nodetool.metadata.node_metadata.PackageModel])
- **count** (int)


## PackageInstallRequest

**Fields:**
- **repo_id**: Repository ID in the format <owner>/<project> (str)


## PackageListResponse

**Fields:**
- **packages** (typing.List[nodetool.packages.registry.PackageInfo])
- **count** (int)


## PackageResponse

**Fields:**
- **success** (bool)
- **message** (str)


### install_package

Install a package from the registry.
**Args:**
- **request (PackageInstallRequest)**
- **user (User) (default: Depends(current_user))**

**Returns:** PackageResponse

### list_available_packages

List all available packages from the registry.
**Args:**
- **user (User) (default: Depends(current_user))**

**Returns:** PackageListResponse

### list_installed_packages

List all installed packages.
**Args:**
- **user (User) (default: Depends(current_user))**

**Returns:** InstalledPackageListResponse

### uninstall_package

Uninstall a package.
**Args:**
- **repo_id (str)**
- **user (User) (default: Depends(current_user))**

**Returns:** PackageResponse

### update_package

Update an installed package.
**Args:**
- **repo_id (str)**
- **user (User) (default: Depends(current_user))**

**Returns:** PackageResponse

