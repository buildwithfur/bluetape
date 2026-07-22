import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { TopBar } from '@/components/AppShell'
import { RecipeEditor } from '@/components/RecipeEditor'
import { useAllPages, useRecipe, useRecipes, useUpdateRecipe } from '@/data/hooks'
import { wikiAuthoringText } from '@/lib/wiki'

export default function RecipeEdit() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const data = useRecipe(id)
  const pages = useAllPages()
  const recipes = useRecipes()
  const update = useUpdateRecipe()
  const [saving, setSaving] = useState(false)

  if (data === undefined || pages === undefined || recipes === undefined) {
    return <><TopBar title={t('recipe.edit')} back /><p className="page-px py-10 text-sm text-text-tertiary">{t('common.loading')}</p></>
  }
  if (data === null || !data.canManage) {
    return <><TopBar title={t('recipe.edit')} back /><p className="page-px py-10 text-sm text-error-text">{t('recipe.notFound')}</p></>
  }

  const { recipe, sections } = data
  const authoring = (value: string) => wikiAuthoringText(value, pages, recipes)
  return (
    <>
      <TopBar title={t('recipe.edit')} back />
      <RecipeEditor
        initial={{
          title: authoring(recipe.title),
          sections: sections.map((section) => ({ name: section.name, ingredients: section.ingredients.map((item) => authoring(item.text)), steps: section.steps.map((item) => authoring(item.text)) })),
          notes: recipe.notes ?? '',
        }}
        sourceUrl={recipe.sourceUrl}
        sourceLabel={`${t(`recipe.sourceType.${recipe.sourceType}`)} · ${recipe.sourceDomain}`}
        saving={saving}
        onSave={async (draft) => {
          setSaving(true)
          try {
            await update({ recipeId: recipe._id, ...draft })
            navigate(`/recipes/${recipe._id}`, { replace: true })
          } finally {
            setSaving(false)
          }
        }}
      />
    </>
  )
}
