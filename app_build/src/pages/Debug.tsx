import { Activity, ArrowLeft, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ActionBadge } from "../components/molecules/ActionBadge";
import { FilterDropdown } from "../components/molecules/FilterDropdown";
// Molécules
import { LabelInput } from "../components/molecules/LabelInput";
import { StatCard } from "../components/molecules/StatCard";
import { CveCard } from "../components/organisms/CveCard";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Progress } from "../components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";
import { Spinner } from "../components/ui/spinner";
import { Switch } from "../components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../components/ui/table";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../components/ui/tooltip";

export function Debug() {
	const navigate = useNavigate();
	return (
		<div className="w-full max-w-6xl mx-auto p-6 md:p-12 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
			<Button
				variant="default"
				size="lg"
				onClick={() => navigate("/")}
				className="fixed bottom-6 right-6 md:bottom-12 md:right-12 flex items-center gap-2 shadow-2xl z-50 transition-all duration-0"
				style={{ marginRight: "var(--removed-body-scroll-bar-size, 0px)" }}
			>
				<ArrowLeft className="w-5 h-5" />
				Retour à l'application
			</Button>
			<div className="mb-10 text-center">
				<h1 className="text-4xl font-bold font-heading mb-4">Design System</h1>
				<p className="text-muted-foreground text-lg">
					Laboratoire Atomic Design : Liste des composants fondamentaux (Atomes)
					utilisés dans l'application Aegis.
				</p>
			</div>

			<div className="flex flex-col gap-12">
				{/* TYPOGRAPHY & COLORS */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">
						Typographie & Couleurs
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-card p-6 rounded-xl border border-border">
						<div className="flex flex-col gap-4">
							<div>
								<h1 className="text-4xl font-bold">Heading 1 (h1)</h1>
								<p className="text-muted-foreground text-sm">
									Utilisé pour les titres de page principaux.
								</p>
							</div>
							<div>
								<h2 className="text-3xl font-semibold border-b pb-2">
									Heading 2 (h2)
								</h2>
								<p className="text-muted-foreground text-sm">
									Utilisé pour les sections principales.
								</p>
							</div>
							<div>
								<h3 className="text-2xl font-semibold">Heading 3 (h3)</h3>
								<p className="text-muted-foreground text-sm">
									Utilisé pour les sous-sections.
								</p>
							</div>
							<div>
								<h4 className="text-xl font-semibold">Heading 4 (h4)</h4>
								<p className="text-muted-foreground text-sm">
									Utilisé pour les titres de widgets ou cartes.
								</p>
							</div>
							<div>
								<p className="leading-7">
									Paragraphe standard. Utilisé pour le texte de contenu
									principal. Le texte est suffisamment espacé pour être lisible,
									même sur de longs blocs.
								</p>
							</div>
						</div>
						<div className="flex flex-col gap-4">
							<div className="flex items-center gap-4">
								<div className="w-12 h-12 rounded-md bg-primary"></div>
								<div>
									<p className="font-medium">Primary</p>
									<p className="text-sm text-muted-foreground">
										Action principale
									</p>
								</div>
							</div>
							<div className="flex items-center gap-4">
								<div className="w-12 h-12 rounded-md bg-secondary"></div>
								<div>
									<p className="font-medium">Secondary</p>
									<p className="text-sm text-muted-foreground">
										Action secondaire ou fond léger
									</p>
								</div>
							</div>
							<div className="flex items-center gap-4">
								<div className="w-12 h-12 rounded-md bg-destructive"></div>
								<div>
									<p className="font-medium">Destructive</p>
									<p className="text-sm text-muted-foreground">
										Actions critiques (suppression, erreur)
									</p>
								</div>
							</div>
							<div className="flex items-center gap-4">
								<div className="w-12 h-12 rounded-md bg-muted"></div>
								<div>
									<p className="font-medium">Muted</p>
									<p className="text-sm text-muted-foreground">
										Fonds discrets ou textes secondaires
									</p>
								</div>
							</div>
							<div className="flex items-center gap-4">
								<div className="w-12 h-12 rounded-md bg-accent"></div>
								<div>
									<p className="font-medium">Accent</p>
									<p className="text-sm text-muted-foreground">
										Survol ou éléments actifs
									</p>
								</div>
							</div>
						</div>
					</div>
				</section>

				{/* BUTTONS */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">
						Boutons (Buttons)
					</h2>
					<div className="flex flex-wrap gap-4 items-center bg-card p-6 rounded-xl border border-border">
						<Button variant="default">Default</Button>
						<Button variant="secondary">Secondary</Button>
						<Button variant="destructive">Destructive</Button>
						<Button variant="outline">Outline</Button>
						<Button variant="ghost">Ghost</Button>
						<Button variant="link">Link</Button>
						<Button disabled>Disabled</Button>
					</div>
				</section>

				{/* BADGES */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">Badges</h2>
					<div className="flex flex-wrap gap-4 items-center bg-card p-6 rounded-xl border border-border">
						<Badge variant="default">Default Badge</Badge>
						<Badge variant="secondary">Secondary Badge</Badge>
						<Badge variant="destructive">Destructive Badge</Badge>
						<Badge variant="outline">Outline Badge</Badge>
					</div>
				</section>

				{/* INPUTS, TEXTAREA, CHECKBOX, SWITCH */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">
						Formulaires (Inputs, Checkbox, Switch)
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-card p-6 rounded-xl border border-border">
						<div className="flex flex-col gap-3">
							<Label htmlFor="email">Email</Label>
							<Input type="email" id="email" placeholder="john@example.com" />
						</div>
						<div className="flex flex-col gap-3">
							<Label htmlFor="disabled">Input Désactivé</Label>
							<Input
								disabled
								type="text"
								id="disabled"
								placeholder="Non modifiable"
							/>
						</div>
						<div className="flex flex-col gap-3 md:col-span-2">
							<Label htmlFor="message">Message</Label>
							<Textarea id="message" placeholder="Votre message ici..." />
						</div>

						<div className="flex items-center space-x-2">
							<Checkbox id="terms" />
							<Label htmlFor="terms">
								Accepter les conditions d'utilisation
							</Label>
						</div>
						<div className="flex items-center space-x-2">
							<Switch id="airplane-mode" />
							<Label htmlFor="airplane-mode">Mode Avion</Label>
						</div>
						<div className="flex items-center space-x-2">
							<Checkbox id="disabled-check" disabled />
							<Label htmlFor="disabled-check" className="text-muted-foreground">
								Checkbox Désactivée
							</Label>
						</div>
						<div className="flex items-center space-x-2">
							<Switch id="disabled-switch" disabled />
							<Label
								htmlFor="disabled-switch"
								className="text-muted-foreground"
							>
								Switch Désactivé
							</Label>
						</div>
					</div>
				</section>

				{/* SELECT */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">
						Sélection (Select)
					</h2>
					<div className="bg-card p-6 rounded-xl border border-border max-w-sm">
						<Select>
							<SelectTrigger>
								<SelectValue placeholder="Sélectionnez un rôle" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="admin">Administrateur</SelectItem>
								<SelectItem value="dev">Développeur</SelectItem>
								<SelectItem value="viewer">Observateur</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</section>

				{/* PROGRESS, TOOLTIP & SPINNER */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">
						Feedback & Tooltips
					</h2>
					<div className="flex flex-col gap-8 bg-card p-6 rounded-xl border border-border">
						<div className="flex flex-col gap-3">
							<Label>Progression (60%)</Label>
							<Progress value={60} className="w-full max-w-md" />
						</div>
						<div className="flex flex-col gap-3">
							<Label>Spinners (Loaders)</Label>
							<div className="flex items-center gap-4">
								<Spinner size="sm" />
								<Spinner size="default" />
								<Spinner size="lg" />
								<Spinner size="xl" className="text-primary" />
							</div>
						</div>
						<div>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button variant="outline">Survolez-moi</Button>
									</TooltipTrigger>
									<TooltipContent>
										<p>Ceci est un composant Tooltip standard.</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					</div>
				</section>

				{/* TABS & CARD */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">
						Conteneurs (Tabs & Cards)
					</h2>
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
						<Tabs defaultValue="tab1" className="w-full">
							<TabsList className="w-full justify-start">
								<TabsTrigger value="tab1">Onglet 1</TabsTrigger>
								<TabsTrigger value="tab2">Onglet 2</TabsTrigger>
							</TabsList>
							<TabsContent
								value="tab1"
								className="p-4 bg-card rounded-xl border border-border mt-2"
							>
								Contenu de l'onglet 1.
							</TabsContent>
							<TabsContent
								value="tab2"
								className="p-4 bg-card rounded-xl border border-border mt-2"
							>
								Contenu de l'onglet 2.
							</TabsContent>
						</Tabs>

						<Card>
							<CardHeader>
								<CardTitle>Composant Card</CardTitle>
								<CardDescription>C'est une Molécule courante.</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									Les cards permettent de regrouper visuellement des
									informations associées.
								</p>
							</CardContent>
						</Card>
					</div>
				</section>

				{/* MOLECULES */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">
						Molécules (Composants Composites)
					</h2>
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
						<div className="bg-card p-6 rounded-xl border border-border flex flex-col gap-6">
							<h3 className="font-semibold text-lg">LabelInput</h3>
							<LabelInput
								label="Nom du Projet"
								id="project-name"
								placeholder="Ex: Aegis"
							/>
							<LabelInput
								label="Clé API"
								id="api-key"
								type="password"
								error="La clé API est invalide ou expirée."
							/>
						</div>

						<div className="bg-card p-6 rounded-xl border border-border flex flex-col gap-6">
							<h3 className="font-semibold text-lg">StatCard</h3>
							<div className="p-8 bg-zinc-950 rounded-xl dark">
								<StatCard
									title="Failles Critiques"
									value={42}
									icon={Activity}
								/>
							</div>
						</div>

						<div className="bg-card p-6 rounded-xl border border-border flex flex-col gap-6">
							<h3 className="font-semibold text-lg">ActionBadge</h3>
							<div className="flex gap-2">
								<ActionBadge
									label="Backend"
									color="indigo"
									onDelete={() => console.log("delete backend")}
								/>
								<ActionBadge
									label="Frontend"
									color="blue"
									onDelete={() => console.log("delete frontend")}
								/>
								<ActionBadge label="Production" color="red" />
							</div>
						</div>

						<div className="bg-card p-6 rounded-xl border border-border flex flex-col gap-6">
							<h3 className="font-semibold text-lg">FilterDropdown</h3>
							<FilterDropdown
								icon={Filter}
								options={[
									{ label: "Toutes les sévérités", value: "all" },
									{ label: "Critique", value: "critical" },
									{ label: "Élevée", value: "high" },
								]}
							/>
						</div>
						<div className="bg-card p-6 rounded-xl border border-border flex flex-col gap-6 lg:col-span-2">
							<h3 className="font-semibold text-lg">CveCard (Organisme)</h3>
							<div className="max-w-[400px]">
								<CveCard
									cveObj={{
										cve: "CVE-2024-12345",
										ref: "CVE-2024-12345",
										severity: "HIGH",
										title: "Denial of service via colliding heading slugs",
										versionRange: ">=2.0.0, <2.9.0",
										cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H",
										ageInDays: 13,
										isBaseline: true,
										fixedIn: "2.9.0",
										link: "https://github.com/advisories/GHSA-1234-5678",
										status: "pending",
									}}
									packageName="league/commonmark"
									projectId={1}
									setToast={() => {}}
									updateStatus={async () => {}}
									handleConfirmCve={() => {}}
									onActionComplete={() => {}}
								/>
							</div>
						</div>
					</div>
				</section>

				{/* MODALS */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">
						Modales (Dialog)
					</h2>
					<div className="flex gap-4 items-center bg-card p-6 rounded-xl border border-border">
						<Dialog>
							<DialogTrigger asChild>
								<Button variant="default">Ouvrir la Modale</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Titre de la Modale</DialogTitle>
									<DialogDescription>
										Ceci est une description standard pour expliquer l'action de
										la modale.
									</DialogDescription>
								</DialogHeader>
								<div className="py-4 text-sm text-muted-foreground">
									Le contenu de la modale va ici. Les marges et le fond d'écran
									sont gérés automatiquement par Shadcn.
								</div>
								<div className="flex justify-end gap-2">
									<Button variant="outline">Annuler</Button>
									<Button>Confirmer</Button>
								</div>
							</DialogContent>
						</Dialog>
					</div>
				</section>

				{/* TABLE */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">
						Tableau (Table)
					</h2>
					<div className="bg-card rounded-xl border border-border overflow-hidden">
						<Table>
							<TableHeader className="bg-muted/50">
								<TableRow>
									<TableHead>Composant</TableHead>
									<TableHead>Type</TableHead>
									<TableHead className="text-right">Statut</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								<TableRow>
									<TableCell className="font-medium">Button</TableCell>
									<TableCell>Atome</TableCell>
									<TableCell className="text-right">
										<Badge>Clean</Badge>
									</TableCell>
								</TableRow>
								<TableRow>
									<TableCell className="font-medium">Card</TableCell>
									<TableCell>Molécule</TableCell>
									<TableCell className="text-right">
										<Badge>Clean</Badge>
									</TableCell>
								</TableRow>
							</TableBody>
						</Table>
					</div>
				</section>
			</div>
		</div>
	);
}
