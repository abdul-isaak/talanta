import type { SheetAction } from '@/components/ui/ActionSheet';
import PromptModal from '@/components/ui/PromptModal';
import { useAnalysis } from '@/lib/analysis/AnalysisProvider';
import { friendlyError } from '@/lib/errors';
import type { VideoWithMeta } from '@/lib/videoMeta';
import { deleteVideo, renameVideo } from '@/lib/videoUpload';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Share } from 'react-native';

type Options = {
  /** Called after a rename or delete so the screen can update its list. */
  onRenamed?: (id: string, title: string) => void;
  onDeleted?: (id: string) => void;
};

/**
 * The owner's actions for a video (view analysis, re-analyze, trim, rename,
 * share, delete), shared by the library, profile and player screens.
 */
export function useVideoActions({ onRenamed, onDeleted }: Options = {}) {
  const router = useRouter();
  const analysis = useAnalysis();
  const [renaming, setRenaming] = useState<VideoWithMeta | null>(null);
  const [busy, setBusy] = useState(false);

  const analyze = (v: VideoWithMeta, confirm = true) => {
    const run = () => {
      analysis.start({
        videoId: v.id,
        playerId: v.player_id,
        title: v.title,
        url: v.video_url,
        start: v.meta.trimStart,
        end: v.meta.trimEnd,
      });
      router.push({ pathname: '/analyze-video' as any, params: { videoId: v.id } });
    };
    if (confirm && v.analysis) {
      Alert.alert('Re-analyze video?', 'This replaces the current AI report for this video.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Re-analyze', onPress: run },
      ]);
    } else run();
  };

  const remove = (v: VideoWithMeta) => {
    Alert.alert('Delete video?', `“${v.title}” and its AI report will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            analysis.cancel(v.id);
            await deleteVideo(v);
            onDeleted?.(v.id);
          } catch (e) {
            Alert.alert('Couldn’t delete video', friendlyError(e, 'delete'));
          }
        },
      },
    ]);
  };

  const share = async (v: VideoWithMeta) => {
    try {
      await Share.share({ message: `Watch my football highlight “${v.title}” on Talanta: ${v.video_url}` });
    } catch { /* dismissed */ }
  };

  const actionsFor = (v: VideoWithMeta, opts: { includePlay?: () => void } = {}): SheetAction[] => {
    const list: SheetAction[] = [];
    if (opts.includePlay) list.push({ key: 'play', label: 'Play video', icon: 'play-circle-outline', onPress: opts.includePlay });
    if (v.analysis) list.push({ key: 'report', label: 'View AI analysis', icon: 'analytics-outline', onPress: () => router.push({ pathname: '/analyze-video' as any, params: { videoId: v.id } }) });
    list.push({
      key: 'analyze',
      label: v.analysis ? 'Re-analyze' : 'Analyze with AI',
      icon: 'sparkles-outline',
      onPress: () => analyze(v),
    });
    list.push({ key: 'trim', label: 'Edit / trim section', icon: 'cut-outline', hint: 'Choose the part the AI should analyze', onPress: () => router.push({ pathname: '/edit-video' as any, params: { videoId: v.id } }) });
    list.push({ key: 'rename', label: 'Rename', icon: 'create-outline', onPress: () => setRenaming(v) });
    list.push({ key: 'share', label: 'Share', icon: 'share-social-outline', onPress: () => share(v) });
    list.push({ key: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true, onPress: () => remove(v) });
    return list;
  };

  const renameModal = (
    <PromptModal
      visible={!!renaming}
      title="Rename video"
      initialValue={renaming?.title ?? ''}
      placeholder="Video title"
      busy={busy}
      onCancel={() => setRenaming(null)}
      onSubmit={async (title) => {
        if (!renaming) return;
        setBusy(true);
        try {
          await renameVideo(renaming.id, title);
          onRenamed?.(renaming.id, title);
          setRenaming(null);
        } catch (e) {
          Alert.alert('Couldn’t rename video', friendlyError(e, 'save'));
        } finally {
          setBusy(false);
        }
      }}
    />
  );

  return { actionsFor, analyze, remove, share, renameModal };
}
