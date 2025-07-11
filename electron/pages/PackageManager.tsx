import React, { useState, useEffect } from 'react';
import './packages.css';
import { PackageModel, PackageListResponse, InstalledPackageListResponse, PackageResponse } from '../src/types';

interface Package {
  name: string;
  description: string;
  repo_id: string;
  version?: string;
  authors?: string[];
  nodes?: string[];
  examples?: string[];
  assets?: string[];
}

const PackageManager: React.FC = () => {
  const [availablePackages, setAvailablePackages] = useState<Package[]>([]);
  const [installedPackages, setInstalledPackages] = useState<Package[]>([]);
  const [filteredPackages, setFilteredPackages] = useState<Package[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activePackageId, setActivePackageId] = useState<string | null>(null);
  const [overlayText, setOverlayText] = useState('');
  const [showOverlay, setShowOverlay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    filterPackages();
  }, [searchTerm, availablePackages]);

  const initialize = async () => {
    try {
      const [availableData, installedData] = await Promise.all([
        fetchAvailablePackages(),
        fetchInstalledPackages()
      ]);

      setAvailablePackages(availableData.packages || []);
      setInstalledPackages(installedData.packages || []);
      setFilteredPackages(availableData.packages || []);
      setLoading(false);
    } catch (error: any) {
      setError(error.message);
      setLoading(false);
    }
  };

  const fetchAvailablePackages = async (): Promise<PackageListResponse> => {
    if (!window.electronAPI) {
      throw new Error('Electron API is not available');
    }
    if (!window.electronAPI.packages) {
      throw new Error('Package API is not available');
    }
    return await window.electronAPI.packages.listAvailable();
  };

  const fetchInstalledPackages = async (): Promise<InstalledPackageListResponse> => {
    if (!window.electronAPI) {
      throw new Error('Electron API is not available');
    }
    if (!window.electronAPI.packages) {
      throw new Error('Package API is not available');
    }
    return await window.electronAPI.packages.listInstalled();
  };

  const installPackage = async (repoId: string): Promise<PackageResponse> => {
    return await window.electronAPI.packages.install(repoId);
  };

  const uninstallPackage = async (repoId: string): Promise<PackageResponse> => {
    return await window.electronAPI.packages.uninstall(repoId);
  };

  const filterPackages = () => {
    const term = searchTerm.toLowerCase();
    const filtered = availablePackages.filter(pkg => 
      pkg.name.toLowerCase().includes(term) ||
      pkg.description.toLowerCase().includes(term) ||
      pkg.repo_id.toLowerCase().includes(term)
    );
    setFilteredPackages(filtered);
  };

  const isPackageInstalled = (repoId: string): boolean => {
    return installedPackages.some(pkg => pkg.repo_id === repoId);
  };

  const handlePackageAction = async (repoId: string, isInstalled: boolean) => {
    if (isProcessing) return;

    setIsProcessing(true);
    setActivePackageId(repoId);

    const pkg = availablePackages.find(p => p.repo_id === repoId);
    const action = isInstalled ? 'Uninstalling' : 'Installing';
    
    setOverlayText(`${action} ${pkg?.name || 'package'}...`);
    setShowOverlay(true);

    try {
      let result: PackageResponse;
      if (isInstalled) {
        result = await uninstallPackage(repoId);
      } else {
        result = await installPackage(repoId);
      }
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      // Refresh installed packages
      const installedData = await fetchInstalledPackages();
      setInstalledPackages(installedData.packages || []);
      
    } catch (error: any) {
      console.error('Package action failed:', error);
      alert(`Failed to ${isInstalled ? 'uninstall' : 'install'} package: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setActivePackageId(null);
      setShowOverlay(false);
    }
  };

  const openExternal = (url: string) => {
    if (window.electronAPI && window.electronAPI.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="loading-container">
          <div className="spinner"></div>
          <div>Loading packages...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="error-container">
          <div className="error-message">
            <div style={{ fontSize: '18px', marginBottom: '8px' }}>Error loading packages</div>
            <div>{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="search-container">
        <div style={{ position: 'relative' }}>
          <span className="search-icon">🔍</span>
          <input 
            type="text" 
            className="search-input" 
            placeholder="Search packages..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={isProcessing}
          />
        </div>
      </div>
      
      <div className="package-list">
        {filteredPackages.length === 0 ? (
          <div className="empty-state">
            <div>No packages found</div>
          </div>
        ) : (
          filteredPackages.map(pkg => {
            const installed = isPackageInstalled(pkg.repo_id);
            const isActive = activePackageId === pkg.repo_id;
            
            return (
              <div 
                key={pkg.repo_id}
                className={`package-item ${isActive ? 'processing' : ''}`}
                title={pkg.description}
              >
                <div className="package-info">
                  <div className="package-name">
                    {pkg.name}
                    {installed && <span className="installed-badge" title="Installed">✓</span>}
                  </div>
                  <div className="package-repo">
                    <a 
                      href="#" 
                      onClick={(e) => {
                        e.preventDefault();
                        openExternal(`https://github.com/${pkg.repo_id}`);
                      }}
                    >
                      {pkg.repo_id}
                    </a>
                  </div>
                </div>
                <div className="package-action">
                  <button 
                    className={`btn ${installed ? 'btn-secondary' : 'btn-primary'}`}
                    onClick={() => handlePackageAction(pkg.repo_id, installed)}
                    disabled={isProcessing}
                  >
                    {isActive && <span className="spinner spinner-small"></span>}
                    {isActive 
                      ? (installed ? 'Uninstalling...' : 'Installing...') 
                      : (installed ? 'Uninstall' : 'Install')}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showOverlay && (
        <div className="overlay">
          <div className="spinner"></div>
          <div className="overlay-text">{overlayText}</div>
        </div>
      )}
    </div>
  );
};

export default PackageManager;