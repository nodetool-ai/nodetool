/**
 * LocalModelFitPage — the primary UI surface for the local-model-fit feature.
 *
 * Layout:
 *   1. Hardware profile selector (preset dropdown + detect + custom overrides)
 *   2. Tier summary chips
 *   3. Search bar + filter toggles + view mode toggle
 *   4. Card grid  OR  list/table view (same data, two renderers)
 */

import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Chip,
  Divider,
  IconButton,
  TextField,
  Tooltip,
  Typography,
  InputAdornment,
  FormControlLabel,
  Switch,
} from "@mui/material";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import ViewListIcon from "@mui/icons-material/ViewList";
import SearchIcon from "@mui/icons-material/Search";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

import { useLocalModelFitStore } from "../../local_model_fit/store/localModelFitStore";
import { useHardwareProfile } from "../../local_model_fit/hooks/useHardwareProfile";
import { useRankedModelFits } from "../../local_model_fit/hooks/useRankedModelFits";
import { useModelFitSummary } from "../../local_model_fit/hooks/useModelFitSummary";
import { getAllCatalogTags, getAllCatalogFamilies } from "../../local_model_fit/modelCatalog";
import type { FitTier } from "../../local_model_fit/types";

import HardwareProfileSelector from "./HardwareProfileSelector";
import TierSummary from "./TierSummary";
import LocalModelFitCardGrid from "./LocalModelFitCardGrid";
import LocalModelFitList from "./LocalModelFitList";
import AppHeader from "../panels/AppHeader";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const LocalModelFitPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, setProfile, detect } = useHardwareProfile();
  const { allResults, results } = useRankedModelFits();
  const { tierCounts, summary } = useModelFitSummary(allResults);

  // Store slices
  const search = useLocalModelFitStore((s) => s.search);
  const setSearch = useLocalModelFitStore((s) => s.setSearch);
  const selectedTags = useLocalModelFitStore((s) => s.selectedTags);
  const setSelectedTags = useLocalModelFitStore((s) => s.setSelectedTags);
  const selectedFamilies = useLocalModelFitStore((s) => s.selectedFamilies);
  const setSelectedFamilies = useLocalModelFitStore((s) => s.setSelectedFamilies);
  const selectedTiers = useLocalModelFitStore((s) => s.selectedTiers);
  const setSelectedTiers = useLocalModelFitStore((s) => s.setSelectedTiers);
  const fitsOnly = useLocalModelFitStore((s) => s.fitsOnly);
  const setFitsOnly = useLocalModelFitStore((s) => s.setFitsOnly);
  const viewMode = useLocalModelFitStore((s) => s.viewMode);
  const setViewMode = useLocalModelFitStore((s) => s.setViewMode);

  // Derived
  const allTags = React.useMemo(() => getAllCatalogTags(), []);
  const allFamilies = React.useMemo(() => getAllCatalogFamilies(), []);

  // Handlers
  const toggleTier = useCallback(
    (tier: FitTier) => {
      setSelectedTiers(
        selectedTiers.includes(tier)
          ? selectedTiers.filter((t) => t !== tier)
          : [...selectedTiers, tier],
      );
    },
    [selectedTiers, setSelectedTiers],
  );

  const toggleTag = useCallback(
    (tag: string) => {
      setSelectedTags(
        selectedTags.includes(tag)
          ? selectedTags.filter((t) => t !== tag)
          : [...selectedTags, tag],
      );
    },
    [selectedTags, setSelectedTags],
  );

  const toggleFamily = useCallback(
    (family: string) => {
      setSelectedFamilies(
        selectedFamilies.includes(family)
          ? selectedFamilies.filter((f) => f !== family)
          : [...selectedFamilies, family],
      );
    },
    [selectedFamilies, setSelectedFamilies],
  );

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/dashboard");
    }
  }, [navigate]);

  return (
    <>
      <AppHeader />
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
          minWidth: 0,
          pt: "64px",
          pl: "48px",
          boxSizing: "border-box",
        }}
      >
      {/* ── Header area ──────────────────────────────────────────── */}
      <Box sx={{ p: 2, pb: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
          <Tooltip title="Back">
            <IconButton
              size="small"
              onClick={handleBack}
              aria-label="Go back"
              sx={{ ml: -0.5 }}
            >
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Local Model Fit
          </Typography>
        </Box>

        {/* Hardware profile */}
        <HardwareProfileSelector
          profile={profile}
          onChangeProfile={setProfile}
          onDetect={detect}
        />

        <Divider sx={{ my: 1.5 }} />

        {/* Tier summary */}
        <TierSummary
          tierCounts={tierCounts}
          selectedTiers={selectedTiers}
          onToggleTier={toggleTier}
          summary={summary}
        />

        <Divider sx={{ my: 1.5 }} />

        {/* Search + primary controls */}
        <Box
          sx={{
            display: "flex",
            gap: 1,
            alignItems: "center",
            flexWrap: "wrap",
            minWidth: 0,
          }}
        >
          <TextField
            size="small"
            placeholder="Search name, family, provider…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ minWidth: 200, flex: "1 1 200px", maxWidth: 420 }}
          />

          <FormControlLabel
            control={
              <Switch size="small" checked={fitsOnly} onChange={(_, v) => setFitsOnly(v)} />
            }
            label={<Typography variant="caption">Fits only</Typography>}
            sx={{ flexShrink: 0 }}
          />

          <Box sx={{ ml: { xs: 0, sm: "auto" }, flexShrink: 0 }}>
            <Tooltip title="Card view">
              <IconButton
                size="small"
                onClick={() => setViewMode("card")}
                color={viewMode === "card" ? "primary" : "default"}
              >
                <ViewModuleIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="List view">
              <IconButton
                size="small"
                onClick={() => setViewMode("list")}
                color={viewMode === "list" ? "primary" : "default"}
              >
                <ViewListIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Tag / family filters (scroll horizontally so they do not crush the bar) */}
        <Box
          sx={{
            display: "flex",
            gap: 0.75,
            alignItems: "center",
            flexWrap: "nowrap",
            overflowX: "auto",
            py: 1,
            mt: 0.5,
            minWidth: 0,
            scrollbarGutter: "stable",
            "&::-webkit-scrollbar": { height: 6 },
          }}
        >
          <Typography variant="caption" sx={{ flexShrink: 0, opacity: 0.6, pr: 0.5 }}>
            Tags
          </Typography>
          {allTags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              onClick={() => toggleTag(tag)}
              color={selectedTags.includes(tag) ? "primary" : "default"}
              variant={selectedTags.includes(tag) ? "filled" : "outlined"}
              sx={{ cursor: "pointer", flexShrink: 0 }}
            />
          ))}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Typography variant="caption" sx={{ flexShrink: 0, opacity: 0.6, pr: 0.5 }}>
            Families
          </Typography>
          {allFamilies.map((fam) => (
            <Chip
              key={fam}
              label={fam}
              size="small"
              onClick={() => toggleFamily(fam)}
              color={selectedFamilies.includes(fam) ? "secondary" : "default"}
              variant={selectedFamilies.includes(fam) ? "filled" : "outlined"}
              sx={{ cursor: "pointer", flexShrink: 0 }}
            />
          ))}
        </Box>

        <Typography variant="caption" sx={{ display: "block", mt: 0.5, opacity: 0.5 }}>
          {results.length} result{results.length !== 1 ? "s" : ""}
          {search.trim() ? " · space = match all words" : ""}
        </Typography>
      </Box>

      {/* ── Results area (scrollable) ────────────────────────────── */}
      <Box sx={{ flex: 1, overflow: "auto", p: 1, minHeight: 0 }}>
        {viewMode === "card" ? (
          <LocalModelFitCardGrid results={results} />
        ) : (
          <LocalModelFitList results={results} />
        )}
      </Box>
    </Box>
    </>
  );
};

export default LocalModelFitPage;
