using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace SmartXeroxHub.Agent.Core
{
    public class PersistentAgentState
    {
        public string SelectedPrinterName { get; set; } = string.Empty;
        public string ConnectionType { get; set; } = "USB";
        public List<DuplexJob> ActiveDuplexJobs { get; set; } = new();
        public DateTime LastSavedAt { get; set; } = DateTime.Now;
    }

    public class RecoveryManager
    {
        private static readonly string StateFilePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SmartXeroxHub",
            "agent_state.json"
        );

        public PersistentAgentState State { get; private set; } = new();

        public RecoveryManager()
        {
            LoadState();
        }

        public void LoadState()
        {
            try
            {
                if (File.Exists(StateFilePath))
                {
                    var json = File.ReadAllText(StateFilePath);
                    var loaded = JsonSerializer.Deserialize<PersistentAgentState>(json);
                    if (loaded != null)
                    {
                        State = loaded;
                        LoggingManager.Info($"[RecoveryManager] Loaded persisted state: {State.ActiveDuplexJobs.Count} active duplex job(s) found.");
                        CheckInterruptedJobs();
                        return;
                    }
                }
            }
            catch (Exception ex)
            {
                LoggingManager.Error("[RecoveryManager] Error reading state file", ex);
            }

            State = new PersistentAgentState();
        }

        public void SaveState()
        {
            try
            {
                var dir = Path.GetDirectoryName(StateFilePath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                State.LastSavedAt = DateTime.Now;
                var json = JsonSerializer.Serialize(State, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(StateFilePath, json);
            }
            catch (Exception ex)
            {
                LoggingManager.Error("[RecoveryManager] Failed to persist state", ex);
            }
        }

        private void CheckInterruptedJobs()
        {
            foreach (var job in State.ActiveDuplexJobs)
            {
                if (job.Stage == DuplexStage.PRINTING_FIRST_SIDE || job.Stage == DuplexStage.FIRST_SIDE_COMPLETED)
                {
                    LoggingManager.Warn($"[RecoveryManager] RESTORED INTERRUPTED JOB {job.OrderNumber}! Job is at stage '{job.Stage}'. Requiring admin confirmation before second side.");
                    job.Stage = DuplexStage.AWAITING_PAPER_REVERSAL;
                }
            }
            SaveState();
        }

        public void TrackDuplexJob(DuplexJob job)
        {
            State.ActiveDuplexJobs.RemoveAll(j => j.OrderId == job.OrderId);
            State.ActiveDuplexJobs.Add(job);
            SaveState();
        }

        public DuplexJob? GetActiveDuplexJob(string orderId)
        {
            return State.ActiveDuplexJobs.Find(j => j.OrderId == orderId);
        }

        public void RemoveDuplexJob(string orderId)
        {
            State.ActiveDuplexJobs.RemoveAll(j => j.OrderId == orderId);
            SaveState();
        }
    }
}
